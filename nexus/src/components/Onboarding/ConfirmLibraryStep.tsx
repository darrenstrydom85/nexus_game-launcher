import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Loader2, Minus, Search } from "lucide-react";
import { useOnboardingStore, type DetectedGame } from "@/stores/onboardingStore";
import { useGameStore, type Game, type GameSource } from "@/stores/gameStore";
import { SOURCE_LABELS } from "@/lib/source-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { FOOTER_PRIMARY, FooterNote, StepFooter } from "./StepFooter";

const GROUP_ORDER: GameSource[] = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox", "standalone"];

function groupLabel(source: string): string {
  if (source === "standalone") return "Your folders";
  return SOURCE_LABELS[source as GameSource] ?? source;
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${n === 1 ? word : `${word}s`}`;
}

/** "312 games from 5 launchers", "40 games from 2 launchers and your folders". */
function summarise(games: Game[]): string {
  if (games.length === 0) return "No games found";
  const sources = new Set<string>(games.map((g) => g.source));
  const launchers = [...sources].filter((s) => s !== "standalone").length;
  const from: string[] = [];
  if (launchers > 0) from.push(plural(launchers, "launcher"));
  if (sources.has("standalone")) from.push("your folders");
  return `${plural(games.length, "game")} from ${from.join(" and ")}`;
}

type CheckState = boolean | "mixed";

export function ConfirmLibraryStep() {
  const games = useGameStore((s) => s.games);
  const rawDetectedGames = useOnboardingStore((s) => s.detectedGames);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);

  // Everything starts selected; a fresh scan resets the selection.
  const [excluded, setExcluded] = React.useState<ReadonlySet<string>>(() => new Set());
  const [prevGames, setPrevGames] = React.useState(games);
  if (prevGames !== games) {
    setPrevGames(games);
    setExcluded(new Set());
  }

  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const groups = React.useMemo(() => {
    const bySource = new Map<string, Game[]>();
    for (const g of games) {
      if (needle && !g.name.toLowerCase().includes(needle)) continue;
      const list = bySource.get(g.source);
      if (list) list.push(g);
      else bySource.set(g.source, [g]);
    }
    const order = [
      ...GROUP_ORDER.filter((s) => bySource.has(s)),
      ...[...bySource.keys()].filter((s) => !GROUP_ORDER.includes(s as GameSource)),
    ];
    return order.map((source) => ({
      source,
      games: bySource.get(source)!.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    }));
  }, [games, needle]);

  const visibleIds = React.useMemo(() => groups.flatMap((g) => g.games.map((game) => game.id)), [groups]);
  const includedCount = games.reduce((n, g) => (excluded.has(g.id) ? n : n + 1), 0);
  const visibleIncluded = visibleIds.reduce((n, id) => (excluded.has(id) ? n : n + 1), 0);

  const toggleOne = React.useCallback((id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = React.useCallback((ids: string[], include: boolean) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (include) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const handleConfirm = React.useCallback(async () => {
    setConfirmError(null);
    setSaving(true);

    // Send ALL games to the backend — included games are imported normally,
    // excluded games are imported with isHidden=true so a future resync won't
    // surface them as new additions.
    const detectedGames: (DetectedGame & { isHidden: boolean })[] = games.map((g) => {
      const idx = parseInt(g.id.replace("detected-", ""), 10);
      const raw: DetectedGame | undefined = rawDetectedGames[idx];
      return {
        name: g.name,
        source: raw?.source ?? g.source,
        sourceId: raw?.sourceId ?? null,
        sourceHint: raw?.sourceHint ?? null,
        folderPath: raw?.folderPath ?? g.folderPath ?? null,
        exePath: raw?.exePath ?? g.exePath ?? null,
        exeName: raw?.exeName ?? g.exeName ?? null,
        launchUrl: raw?.launchUrl ?? g.launchUrl ?? null,
        sourceFolderId: raw?.sourceFolderId ?? null,
        potentialExeNames: raw?.potentialExeNames ?? null,
        isHidden: excluded.has(g.id),
      };
    });

    let saved: { id: string; isHidden?: boolean }[];
    try {
      saved = await invoke<{ id: string; isHidden?: boolean }[]>("confirm_games", { detectedGames });
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : JSON.stringify(err);
      setConfirmError(msg);
      setSaving(false);
      return;
    }
    // Games already in the library keep their old hidden flag through an import
    // (so re-scans never undo a hide). Here the user just chose, so apply it.
    await Promise.allSettled(
      (saved ?? []).flatMap((game, i) =>
        game && Boolean(game.isHidden) !== detectedGames[i]?.isHidden
          ? [invoke("update_game", { id: game.id, fields: { isHidden: detectedGames[i].isHidden } })]
          : [],
      ),
    );
    // Re-linking old sessions helps, but isn't worth failing setup over.
    await invoke("relink_play_sessions").catch(() => {});
    // Without this flag the wizard returns next launch; try twice before moving on.
    await invoke("set_setting", { key: "onboarding_completed", value: "true" }).catch(() =>
      invoke("set_setting", { key: "onboarding_completed", value: "true" }).catch(() => {}),
    );
    completeOnboarding();
  }, [games, excluded, rawDetectedGames, completeOnboarding]);

  const nothingSelected = games.length > 0 && includedCount === 0;

  return (
    <div data-testid="confirm-step">
      <div data-testid="confirm-top-bar" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[15px] font-semibold text-foreground">{summarise(games)}</p>
        {games.length > 0 && (
          <p data-testid="confirm-selected-count" className="text-[13px] tabular-nums text-muted-foreground">
            {includedCount.toLocaleString()} selected
          </p>
        )}
      </div>

      {games.length === 0 ? (
        <div data-testid="confirm-empty" className="mt-5 rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">Nothing to add yet</p>
          <p className="mx-auto mt-1 max-w-[400px] text-[13px] text-muted-foreground">
            Go back to turn on another launcher or add a folder. Or finish now and add games later from Settings.
          </p>
        </div>
      ) : (
        <>
          {/* Stays in view while the list scrolls. */}
          <div className="sticky top-0 z-10 -mx-2 mt-3 bg-background px-2 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <input
                  type="search"
                  data-testid="confirm-filter"
                  aria-label="Filter games"
                  placeholder="Filter games"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 w-full rounded-lg border border-input bg-background/60 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <Button
                variant="outline"
                data-testid="confirm-select-all"
                disabled={visibleIncluded === visibleIds.length}
                onClick={() => setMany(visibleIds, true)}
                className="h-10 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
              >
                Select all
              </Button>
              <Button
                variant="outline"
                data-testid="confirm-select-none"
                disabled={visibleIncluded === 0}
                onClick={() => setMany(visibleIds, false)}
                className="h-10 rounded-lg focus-visible:ring-2 focus-visible:ring-ring"
              >
                Select none
              </Button>
            </div>
            {confirmError && (
              <div
                role="alert"
                data-testid="confirm-error"
                className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] text-destructive"
              >
                Couldn’t add your games: {confirmError}
              </div>
            )}
          </div>

          <div data-testid="confirm-game-list" className="mt-2 flex flex-col gap-5">
            {groups.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-muted-foreground">No games match “{query.trim()}”.</p>
            ) : (
              groups.map((group) => (
                <GameGroup
                  key={group.source}
                  source={group.source}
                  games={group.games}
                  excluded={excluded}
                  onToggle={toggleOne}
                  onSetMany={setMany}
                />
              ))
            )}
          </div>
        </>
      )}

      <StepFooter>
        {nothingSelected && (
          <FooterNote id="confirm-finish-hint" data-testid="confirm-finish-hint">
            Select at least one game to add.
          </FooterNote>
        )}
        <Button
          data-testid="confirm-finish"
          className={FOOTER_PRIMARY}
          disabled={saving || nothingSelected}
          aria-describedby={nothingSelected ? "confirm-finish-hint" : undefined}
          onClick={handleConfirm}
        >
          {saving ? (
            <>
              <Loader2 className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
              Adding games…
            </>
          ) : games.length === 0 ? (
            "Finish setup"
          ) : (
            `Add ${plural(includedCount, "game")} to Nexus`
          )}
        </Button>
      </StepFooter>
    </div>
  );
}

function GameGroup({
  source,
  games,
  excluded,
  onToggle,
  onSetMany,
}: {
  source: string;
  games: Game[];
  excluded: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], include: boolean) => void;
}) {
  const labelId = React.useId();
  const selected = games.reduce((n, g) => (excluded.has(g.id) ? n : n + 1), 0);
  const state: CheckState = selected === games.length ? true : selected === 0 ? false : "mixed";

  return (
    <section aria-labelledby={labelId} data-testid={`confirm-group-${source}`}>
      <div className="mb-1.5 flex items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={state}
          data-testid={`confirm-group-toggle-${source}`}
          onClick={() => onSetMany(games.map((g) => g.id), state !== true)}
          className="-ml-1 flex items-center gap-2.5 rounded-md px-1 py-1 outline-none transition-colors duration-150 hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CheckBox state={state} />
          <span id={labelId} className="text-[13px] font-semibold text-foreground">
            {groupLabel(source)}
          </span>
        </button>
        <span className="text-[12.5px] tabular-nums text-muted-foreground">
          {selected.toLocaleString()} of {games.length.toLocaleString()}
        </span>
      </div>
      <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
        {games.map((game) => (
          <li key={game.id}>
            <GameRow id={game.id} name={game.name} included={!excluded.has(game.id)} onToggle={onToggle} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One game. Memoised so toggling a row doesn't re-render the other 500. */
const GameRow = React.memo(function GameRow({
  id,
  name,
  included,
  onToggle,
}: {
  id: string;
  name: string;
  included: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={included}
      data-testid={`confirm-card-${id}`}
      onClick={() => onToggle(id)}
      className="flex h-11 w-full items-center gap-3 px-3.5 text-left outline-none hover:bg-secondary/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <CheckBox state={included} />
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold text-white/80"
        style={{ background: placeholderGradient(name) }}
      >
        {name.charAt(0)}
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-[13px]", included ? "text-foreground" : "text-muted-foreground")}>
        {name}
      </span>
    </button>
  );
});

function CheckBox({ state }: { state: CheckState }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border",
        state === false ? "border-muted-foreground/40" : "border-primary bg-primary text-primary-foreground",
      )}
    >
      {state === true && <Check className="size-3" strokeWidth={2.5} />}
      {state === "mixed" && <Minus className="size-3" strokeWidth={2.5} />}
    </span>
  );
}
