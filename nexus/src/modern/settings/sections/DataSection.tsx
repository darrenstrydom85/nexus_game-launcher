import * as React from "react";
import { AlertTriangle, Check, CheckCircle2, Copy, Download, Eye, FolderOpen, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { cn, formatPlayTime } from "@/lib/utils";
import type { DeadGame } from "@/lib/tauri";
import { useSettingsStore } from "@/stores/settingsStore";
import { refreshGames, useGameStore } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import { DANGER_BUTTON, SettingsCard, SettingsRow, ToggleRow } from "../SettingsKit";
import { importToast, useDataManagement, type ResetMode, type ShortSessionsCount } from "../hooks/useDataManagement";
import { useDeadGameActions, useLibraryHealthCheck } from "../hooks/useLibraryHealth";
import { useHiddenGames } from "../hooks/useHiddenGames";

type DataManagement = ReturnType<typeof useDataManagement>;

const SOURCE_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "3 days ago", "Yesterday", "Just now". */
function timeAgo(iso: string, now = Date.now()): string {
  const secs = (new Date(iso).getTime() - now) / 1000;
  if (Number.isNaN(secs)) return "Unknown";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(secs) >= size) {
      const text = rtf.format(Math.round(secs / size), unit);
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
  }
  return "Just now";
}

/** Small cover tile for game rows; falls back to the name gradient. */
function Thumb({ src, name }: { src: string | null | undefined; name: string }) {
  return (
    <span aria-hidden className="img-outline size-9 shrink-0 overflow-hidden rounded-[9px] bg-secondary">
      {src ? (
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        <span className="block size-full" style={{ background: placeholderGradient(name) }} />
      )}
    </span>
  );
}

export function DataSection() {
  const data = useDataManagement();
  return (
    <>
      <YourDataCard data={data} />
      <LibraryHealthCard />
      <DangerZoneCard data={data} />
    </>
  );
}

// ── Your data ────────────────────────────────────────────────────────

type Unit = "sec" | "min";
const UNITS: { value: Unit; label: string }[] = [
  { value: "sec", label: "sec" },
  { value: "min", label: "min" },
];

function YourDataCard({ data }: { data: DataManagement }) {
  const addToast = useToastStore((s) => s.addToast);
  const [rawThreshold, setRawThreshold] = React.useState("2");
  const [unit, setUnit] = React.useState<Unit>("min");
  const [shortSessions, setShortSessions] = React.useState<ShortSessionsCount | null>(null);
  const [confirmShort, setConfirmShort] = React.useState(false);
  const thresholdId = React.useId();

  const threshold = Math.max(1, parseInt(rawThreshold, 10) || 1);
  const thresholdSecs = unit === "min" ? threshold * 60 : threshold;
  const thresholdLabel = plural(threshold, unit === "min" ? "minute" : "second");

  const handleExport = () => {
    data
      .exportLibrary()
      .then((saved) => saved && addToast({ type: "success", message: "Library exported." }))
      .catch(() => addToast({ type: "error", message: "Couldn’t export the library. Please try again." }));
  };

  const handleImport = () => {
    data
      .importLibrary()
      .then((result) => result && addToast(importToast(result)))
      .catch(() => addToast({ type: "error", message: "Couldn’t import that file. Check it’s a Nexus library export." }));
  };

  const handleFindShort = () => {
    data
      .countShortSessions(thresholdSecs)
      .then((count) => {
        if (count.sessionsCount === 0) {
          addToast({ type: "info", message: `No sessions under ${thresholdLabel}.` });
          return;
        }
        setShortSessions(count);
        setConfirmShort(true);
      })
      .catch(() => addToast({ type: "error", message: "Couldn’t count short sessions. Please try again." }));
  };

  const handleRemoveShort = () => {
    data
      .deleteShortSessions(thresholdSecs)
      .then((result) => {
        void refreshGames();
        addToast({
          type: "success",
          message: `Removed ${plural(result.sessionsRemoved, "session")} across ${plural(result.gamesAffected, "game")}. Play time has been recalculated.`,
        });
      })
      .catch(() => addToast({ type: "error", message: "Couldn’t remove short sessions. Please try again." }));
  };

  const handleClearCache = () => {
    data
      .clearCache()
      .then(() => addToast({ type: "success", message: "Image cache cleared." }))
      .catch(() => addToast({ type: "error", message: "Couldn’t clear the image cache." }));
  };

  const cacheDescription =
    data.cacheSize === undefined ? "Measuring…" : data.cacheSize === null ? "Size unavailable" : `${data.cacheSize} of downloaded artwork`;

  return (
    <SettingsCard title="Your data" data-testid="data-your-data">
      <SettingsRow label="Export library" description="Every game and its details as a JSON file">
        <Button variant="outline" size="sm" data-testid="data-export" disabled={data.isBusy("export")} onClick={handleExport}>
          <Download className="size-3.5" strokeWidth={1.75} />
          Export
        </Button>
      </SettingsRow>
      <SettingsRow label="Import library" description="Adds games from a Nexus library export and re-links their play history">
        <Button variant="outline" size="sm" data-testid="data-import" disabled={data.isBusy("import")} onClick={handleImport}>
          <Upload className="size-3.5" strokeWidth={1.75} />
          {data.isBusy("import") ? "Importing…" : "Import"}
        </Button>
      </SettingsRow>
      <SettingsRow label="Remove short sessions" labelFor={thresholdId} description={`Sessions under ${thresholdLabel}`}>
        <input
          id={thresholdId}
          type="number"
          inputMode="numeric"
          min={1}
          data-testid="short-session-threshold"
          value={rawThreshold}
          onChange={(e) => setRawThreshold(e.target.value)}
          onBlur={() => setRawThreshold(String(threshold))}
          className="h-8 w-16 rounded-md border border-input bg-background/60 px-2 text-[13px] tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <SegmentedControl aria-label="Session length unit" value={unit} onValueChange={setUnit} options={UNITS} />
        <Button
          variant="outline"
          size="sm"
          className={DANGER_BUTTON}
          data-testid="data-short-sessions"
          disabled={data.isBusy("previewShort") || data.isBusy("deleteShort")}
          onClick={handleFindShort}
        >
          {data.isBusy("deleteShort") ? "Removing…" : "Remove"}
        </Button>
      </SettingsRow>
      <SettingsRow label="Image cache" description={cacheDescription}>
        <Button variant="outline" size="sm" data-testid="data-clear-cache" disabled={data.isBusy("cache") || !data.cacheSize} onClick={handleClearCache}>
          {data.isBusy("cache") ? "Clearing…" : "Clear"}
        </Button>
      </SettingsRow>
      <SettingsRow
        label="Data folder"
        description={
          <span className="break-all font-mono text-[12px]">
            {data.dataFolder === undefined ? "…" : (data.dataFolder ?? "Unknown")}
          </span>
        }
      >
        <Button
          variant="outline"
          size="sm"
          data-testid="data-open-db"
          disabled={!data.dataFolder}
          onClick={() => data.openDataFolder().catch(() => addToast({ type: "error", message: "Couldn’t open the data folder." }))}
        >
          <FolderOpen className="size-3.5" strokeWidth={1.75} />
          Open
        </Button>
      </SettingsRow>

      <ConfirmDialog
        open={confirmShort}
        onOpenChange={setConfirmShort}
        title="Remove short sessions?"
        description={
          shortSessions
            ? `${plural(shortSessions.sessionsCount, "session")} across ${plural(shortSessions.gamesAffected, "game")} ${shortSessions.sessionsCount === 1 ? "is" : "are"} under ${thresholdLabel}. They will be deleted and play time recalculated. This cannot be undone.`
            : ""
        }
        confirmLabel="Remove sessions"
        destructive
        onConfirm={handleRemoveShort}
      />
    </SettingsCard>
  );
}

// ── Library health ───────────────────────────────────────────────────

function LibraryHealthCard() {
  const lastCheckAt = useSettingsStore((s) => s.lastHealthCheckAt);
  const issueCount = useSettingsStore((s) => s.healthCheckIssueCount);
  const autoCheck = useSettingsStore((s) => s.autoHealthCheck);
  const setAutoCheck = useSettingsStore((s) => s.setAutoHealthCheck);
  const games = useGameStore((s) => s.games);
  const check = useLibraryHealthCheck();
  const fixes = useDeadGameActions(check.deadGames, check.setDeadGames);
  const hidden = useHiddenGames();
  const [showHidden, setShowHidden] = React.useState(false);
  const [confirmRemoveAll, setConfirmRemoveAll] = React.useState(false);
  const [confirmUnhideAll, setConfirmUnhideAll] = React.useState(false);
  const hiddenListId = React.useId();

  const covers = React.useMemo(() => new Map(games.map((g) => [g.id, g.customCover ?? g.coverUrl ?? null])), [games]);
  const hiddenCount = hidden.hiddenGames.length;
  const missing = check.deadGames;

  React.useEffect(() => {
    if (hiddenCount === 0) setShowHidden(false);
  }, [hiddenCount]);

  const summary =
    issueCount > 0
      ? `${plural(issueCount, "game")} missing`
      : check.totalChecked != null && check.totalChecked > 1
        ? `All ${check.totalChecked} games found`
        : "No missing games";

  const runDescription = check.running
    ? check.progress
      ? `Checking ${check.progress.checked} of ${check.progress.total}…`
      : "Starting…"
    : check.hasRun
      ? missing.length > 0
        ? `${plural(missing.length, "game")} couldn’t be found. Point each one at its new location, or remove it.`
        : "Every game was found"
      : issueCount > 0
        ? "Run a check to see which games are missing and fix them"
        : "Looks for games whose files have moved or been deleted";

  return (
    <SettingsCard title="Library health" data-testid="library-health-section">
      <ToggleRow
        data-testid="auto-health-check-toggle"
        label="Check automatically on startup"
        description="At most once a week"
        checked={autoCheck}
        onCheckedChange={setAutoCheck}
      />
      <SettingsRow label="Last check" description={lastCheckAt ? timeAgo(lastCheckAt) : "Never"}>
        {lastCheckAt && (
          <span
            data-testid="health-summary"
            className={cn("flex items-center gap-1.5 text-[13px]", issueCount > 0 ? "text-foreground" : "text-muted-foreground")}
          >
            {issueCount > 0 ? (
              <AlertTriangle className="size-3.5 text-warning" strokeWidth={1.5} aria-hidden />
            ) : (
              <CheckCircle2 className="size-3.5 text-success" strokeWidth={1.5} aria-hidden />
            )}
            {summary}
          </span>
        )}
      </SettingsRow>
      <SettingsRow label="Run a check now" description={<span aria-live="polite">{runDescription}</span>}>
        <Button variant="outline" size="sm" data-testid="run-health-check" disabled={check.running} onClick={() => void check.run()}>
          {check.running && <Loader2 className="size-3.5 motion-safe:animate-spin" strokeWidth={1.75} aria-hidden />}
          {check.running ? "Checking…" : "Check now"}
        </Button>
      </SettingsRow>

      {check.hasRun && !check.running && missing.length > 0 && (
        <div data-testid="health-dead-games" className="divide-y divide-border/70 bg-secondary/25">
          <ul aria-label="Missing games" className="divide-y divide-border/70">
            {missing.map((game) => (
              <li key={game.id}>
                <DeadGameItem game={game} coverUrl={covers.get(game.id)} onFix={fixes.fixPath} onRemove={fixes.remove} />
              </li>
            ))}
          </ul>
          {missing.length > 1 && (
            <SettingsRow label={`Remove all ${missing.length}`} description="Hides them from the library. You can bring them back from Hidden games.">
              <Button
                variant="outline"
                size="sm"
                className={DANGER_BUTTON}
                data-testid="health-check-remove-all"
                onClick={() => setConfirmRemoveAll(true)}
              >
                Remove all
              </Button>
            </SettingsRow>
          )}
        </div>
      )}

      <SettingsRow label="Hidden games" description={hiddenCount > 0 ? `${hiddenCount} hidden` : "None hidden"}>
        {showHidden && hiddenCount > 1 && (
          <Button variant="outline" size="sm" data-testid="unhide-all" onClick={() => setConfirmUnhideAll(true)}>
            Unhide all
          </Button>
        )}
        {hiddenCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            data-testid="hidden-games-manage"
            aria-expanded={showHidden}
            aria-controls={showHidden ? hiddenListId : undefined}
            onClick={() => setShowHidden((v) => !v)}
          >
            {showHidden ? "Done" : "Manage"}
          </Button>
        )}
      </SettingsRow>
      {showHidden && hiddenCount > 0 && (
        <ul
          id={hiddenListId}
          aria-label="Hidden games"
          data-testid="hidden-games-list"
          className="max-h-[360px] divide-y divide-border/70 overflow-y-auto bg-secondary/25"
        >
          {hidden.hiddenGames.map((g) => (
            <li key={g.id}>
              <SettingsRow
                data-testid={`hidden-game-row-${g.id}`}
                leading={<Thumb src={g.coverUrl} name={g.name} />}
                label={<span className="block truncate">{g.name}</span>}
              >
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={`unhide-btn-${g.id}`}
                  aria-label={`Unhide ${g.name}`}
                  onClick={() => void hidden.unhide(g.id, g.name)}
                >
                  <Eye className="size-3.5" strokeWidth={1.75} />
                  Unhide
                </Button>
              </SettingsRow>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmRemoveAll}
        onOpenChange={setConfirmRemoveAll}
        title={`Remove ${plural(missing.length, "missing game")}?`}
        description="They’re hidden from the library rather than deleted. You can unhide them one by one from Hidden games."
        confirmLabel="Remove all"
        destructive
        onConfirm={() => void fixes.removeAll()}
      />
      <ConfirmDialog
        open={confirmUnhideAll}
        onOpenChange={setConfirmUnhideAll}
        title={`Unhide ${plural(hiddenCount, "game")}?`}
        description="Every hidden game goes back into your library. You’d have to hide them again one at a time."
        confirmLabel="Unhide all"
        onConfirm={() => void hidden.unhideAll()}
      />
    </SettingsCard>
  );
}

function DeadGameItem({
  game,
  coverUrl,
  onFix,
  onRemove,
}: {
  game: DeadGame;
  coverUrl: string | null | undefined;
  onFix: (game: DeadGame) => Promise<boolean>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [fixing, setFixing] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const path = game.exePath ?? "(no path)";
  const played = [
    game.lastPlayed ? `Last played ${new Date(game.lastPlayed).toLocaleDateString()}` : "Never played",
    game.totalPlayTimeS >= 60 ? `${formatPlayTime(game.totalPlayTimeS)} played` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const handleFix = () => {
    setFixing(true);
    onFix(game)
      .catch(() => false)
      .finally(() => setFixing(false));
  };

  return (
    <SettingsRow
      data-testid={`dead-game-row-${game.id}`}
      leading={<Thumb src={coverUrl} name={game.name} />}
      label={
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate">{game.name}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-px text-[11px] font-medium text-muted-foreground">
            {SOURCE_LABELS[game.source] ?? game.source}
          </span>
        </span>
      }
      description={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span>{played}</span>
          <span className="flex min-w-0 items-center gap-1">
            <code data-testid={`dead-game-path-${game.id}`} title={path} className="min-w-0 truncate font-mono text-[11.5px]">
              {path}
            </code>
            {game.exePath && (
              <button
                type="button"
                data-testid={`dead-game-copy-${game.id}`}
                aria-label={copied ? "Path copied" : "Copy path"}
                onClick={() =>
                  navigator.clipboard
                    .writeText(path)
                    .then(() => setCopied(true))
                    .catch(() => {})
                }
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-md outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  copied && "text-success",
                )}
              >
                {copied ? <Check className="size-3.5" strokeWidth={1.75} /> : <Copy className="size-3.5" strokeWidth={1.75} />}
              </button>
            )}
          </span>
        </span>
      }
    >
      <Button variant="outline" size="sm" data-testid={`dead-game-fix-${game.id}`} disabled={fixing} onClick={handleFix}>
        {fixing ? "Choosing…" : "Fix path"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={DANGER_BUTTON}
        data-testid={`dead-game-remove-${game.id}`}
        aria-label={`Remove ${game.name}`}
        onClick={() => void onRemove(game.id)}
      >
        Remove
      </Button>
    </SettingsRow>
  );
}

// ── Danger zone ──────────────────────────────────────────────────────

type DangerAction = "clear" | ResetMode;

const DANGER_COPY: Record<DangerAction, { title: string; description: string; confirmLabel: string }> = {
  clear: {
    title: "Clear play history?",
    description: "Every play session is deleted and play time goes back to zero for every game. This cannot be undone.",
    confirmLabel: "Clear history",
  },
  keepStats: {
    title: "Reset your library?",
    description:
      "Your games, collections, watched folders and settings are deleted. Play history and API keys are kept, ready to re-link when you import again. Nexus restarts afterwards.",
    confirmLabel: "Reset library",
  },
  keepKeys: {
    title: "Reset everything?",
    description: "All Nexus data is deleted, including play history. Your API keys are kept. Nexus restarts into onboarding. This cannot be undone.",
    confirmLabel: "Reset everything",
  },
  all: {
    title: "Reset everything?",
    description: "All Nexus data is deleted, including play history and API keys. Nexus restarts into onboarding. This cannot be undone.",
    confirmLabel: "Reset everything",
  },
};

function DangerZoneCard({ data }: { data: DataManagement }) {
  const addToast = useToastStore((s) => s.addToast);
  const [action, setAction] = React.useState<DangerAction>("clear");
  const [open, setOpen] = React.useState(false);
  const [keepKeys, setKeepKeys] = React.useState(false);
  const keepKeysId = React.useId();
  const resetting = data.isBusy("reset");

  const ask = (next: DangerAction) => {
    setAction(next);
    setOpen(true);
  };

  const run = () => {
    if (action === "clear") {
      data
        .clearHistory()
        .then(() => {
          void refreshGames();
          addToast({ type: "success", message: "Play history cleared." });
        })
        .catch(() => addToast({ type: "error", message: "Couldn’t clear play history. Please try again." }));
      return;
    }
    data.reset(action).catch(() => addToast({ type: "error", message: "Couldn’t reset Nexus. Please try again." }));
  };

  const copy = DANGER_COPY[action];

  return (
    <SettingsCard title="Danger zone" tone="danger" data-testid="data-danger-zone">
      <SettingsRow label="Clear play history" description="Deletes every play session. Cannot be undone.">
        <Button
          variant="outline"
          size="sm"
          className={DANGER_BUTTON}
          data-testid="data-clear-history"
          disabled={data.isBusy("clearHistory")}
          onClick={() => ask("clear")}
        >
          {data.isBusy("clearHistory") ? "Clearing…" : "Clear"}
        </Button>
      </SettingsRow>
      <SettingsRow label="Reset library" description="Removes your games and settings but keeps play history and API keys.">
        <Button
          variant="outline"
          size="sm"
          className={DANGER_BUTTON}
          data-testid="data-reset-library"
          disabled={resetting}
          onClick={() => ask("keepStats")}
        >
          Reset library
        </Button>
      </SettingsRow>
      <SettingsRow label="Reset everything" description="Deletes all Nexus data and restarts onboarding.">
        <span className="flex items-center gap-2">
          <Switch id={keepKeysId} data-testid="data-reset-keep-keys" checked={keepKeys} onCheckedChange={setKeepKeys} />
          <label htmlFor={keepKeysId} className="text-[13px] text-muted-foreground">
            Keep API keys
          </label>
        </span>
        <Button
          variant="outline"
          size="sm"
          className={DANGER_BUTTON}
          data-testid="data-reset-everything"
          disabled={resetting}
          onClick={() => ask(keepKeys ? "keepKeys" : "all")}
        >
          {resetting ? "Resetting…" : "Reset everything"}
        </Button>
      </SettingsRow>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.title}
        description={copy.description}
        confirmLabel={copy.confirmLabel}
        destructive
        onConfirm={run}
      />
    </SettingsCard>
  );
}
