import * as React from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore, type DetectedGame } from "@/stores/onboardingStore";
import { useGameStore, type Game, type GameSource } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { RotateCcw, Check } from "lucide-react";
import { placeholderGradient } from "@/components/GameCard/GameCard";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "B.net",
  xbox: "Xbox",
  standalone: "Local",
};

interface ConfirmableGame extends Game {
  included: boolean;
  editedName: string;
}

export function ConfirmLibraryStep() {
  const games = useGameStore((s) => s.games);
  const rawDetectedGames = useOnboardingStore((s) => s.detectedGames);
  const completeOnboarding = useOnboardingStore((s) => s.completeOnboarding);
  const goBack = useOnboardingStore((s) => s.goBack);
  const [confirmGames, setConfirmGames] = React.useState<ConfirmableGame[]>([]);
  const [filterSource, setFilterSource] = React.useState<GameSource | "all">("all");

  React.useEffect(() => {
    setConfirmGames(
      games.map((g) => ({ ...g, included: true, editedName: g.name })),
    );
  }, [games]);

  const sources = React.useMemo(() => {
    const set = new Set(games.map((g) => g.source));
    return Array.from(set);
  }, [games]);

  const filtered = React.useMemo(() => {
    const list =
      filterSource === "all"
        ? confirmGames
        : confirmGames.filter((g) => g.source === filterSource);
    return [...list].sort((a, b) =>
      a.editedName.localeCompare(b.editedName, undefined, { sensitivity: "base" }),
    );
  }, [confirmGames, filterSource]);

  const includedCount = confirmGames.filter((g) => g.included).length;
  const allFilteredIncluded = filtered.length > 0 && filtered.every((g) => g.included);

  const toggleInclude = React.useCallback((id: string) => {
    setConfirmGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, included: !g.included } : g)),
    );
  }, []);

  const toggleAllFiltered = React.useCallback(() => {
    const filteredIds = new Set(filtered.map((g) => g.id));
    const shouldInclude = !allFilteredIncluded;
    setConfirmGames((prev) =>
      prev.map((g) => (filteredIds.has(g.id) ? { ...g, included: shouldInclude } : g)),
    );
  }, [filtered, allFilteredIncluded]);

  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const handleConfirm = React.useCallback(async () => {
    setConfirmError(null);

    // Send ALL games to the backend — included games are imported normally,
    // excluded games are imported with isHidden=true so a future resync won't
    // surface them as new additions.
    const detectedGames: (DetectedGame & { isHidden: boolean })[] = confirmGames.map((g) => {
      const idx = parseInt(g.id.replace("detected-", ""), 10);
      const raw: DetectedGame | undefined = rawDetectedGames[idx];
      return {
        name: g.editedName,
        source: raw?.source ?? g.source,
        sourceId: raw?.sourceId ?? null,
        sourceHint: raw?.sourceHint ?? null,
        folderPath: raw?.folderPath ?? g.folderPath ?? null,
        exePath: raw?.exePath ?? g.exePath ?? null,
        exeName: raw?.exeName ?? g.exeName ?? null,
        launchUrl: raw?.launchUrl ?? g.launchUrl ?? null,
        sourceFolderId: raw?.sourceFolderId ?? null,
        potentialExeNames: raw?.potentialExeNames ?? null,
        isHidden: !g.included,
      };
    });

    try {
      await invoke("confirm_games", { detectedGames });
      await invoke("relink_play_sessions");
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : JSON.stringify(err);
      setConfirmError(msg);
      return;
    }
    try {
      await invoke("set_setting", { key: "onboarding_completed", value: "true" });
    } catch {
      // best-effort
    }
    completeOnboarding();
  }, [confirmGames, rawDetectedGames, completeOnboarding]);

  return (
    <div data-testid="confirm-step" className="flex w-full max-w-3xl flex-col gap-4">
      {/* Top bar */}
      <div data-testid="confirm-top-bar" className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">
          Found {confirmGames.length} games across {sources.length} sources
        </h2>
        <span className="text-sm text-muted-foreground">
          {includedCount} selected
        </span>
      </div>

      {/* Filter tabs */}
      <div data-testid="confirm-filter-tabs" className="flex gap-1">
        <button
          data-testid="filter-all"
          className={cn(
            "rounded-md px-3 py-1 text-sm",
            filterSource === "all"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setFilterSource("all")}
        >
          All ({confirmGames.length})
        </button>
        {sources.map((s) => (
          <button
            key={s}
            data-testid={`filter-${s}`}
            className={cn(
              "rounded-md px-3 py-1 text-sm",
              filterSource === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setFilterSource(s)}
          >
            {SOURCE_LABELS[s]} ({confirmGames.filter((g) => g.source === s).length})
          </button>
        ))}
      </div>

      {/* Select / deselect all for current filter */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          data-testid="confirm-toggle-all"
          onClick={toggleAllFiltered}
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded border",
            allFilteredIncluded
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-transparent",
          )}
          aria-label={allFilteredIncluded ? "Deselect all" : "Select all"}
        >
          {allFilteredIncluded && <Check className="size-3" />}
        </button>
        <span className="text-sm text-muted-foreground">
          {allFilteredIncluded ? "Deselect all" : "Select all"}
        </span>
      </div>

      {/* Checkbox list */}
      <div
        data-testid="confirm-game-list"
        className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto pr-1"
      >
        {filtered.map((game) => (
          <button
            key={game.id}
            data-testid={`confirm-card-${game.id}`}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
              "hover:bg-card/60",
              game.included ? "opacity-100" : "opacity-40",
            )}
            onClick={() => toggleInclude(game.id)}
            aria-pressed={game.included}
          >
            {/* Checkbox */}
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                game.included
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-transparent",
              )}
              aria-hidden
            >
              {game.included && <Check className="size-3" />}
            </span>

            {/* Thumbnail */}
            <span className="size-8 shrink-0 overflow-hidden rounded">
              {game.coverUrl ? (
                <img
                  src={game.coverUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span
                  className="flex size-full items-center justify-center text-xs text-white/60"
                  style={{ background: placeholderGradient(game.editedName) }}
                  aria-hidden
                >
                  {game.editedName.charAt(0)}
                </span>
              )}
            </span>

            {/* Name */}
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {game.editedName}
            </span>

            {/* Source badge */}
            <span className="shrink-0 rounded bg-card px-1.5 py-0.5 text-xs text-muted-foreground">
              {SOURCE_LABELS[game.source]}
            </span>
          </button>
        ))}
      </div>

      {confirmError && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          Failed to save games: {confirmError}
        </div>
      )}

      {/* Actions */}
      <div data-testid="confirm-actions" className="flex items-center justify-between pt-2">
        <button
          data-testid="confirm-scan-again"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          onClick={goBack}
        >
          <RotateCcw className="size-3.5" />
          Scan again
        </button>
        <Button
          data-testid="confirm-finish"
          size="lg"
          onClick={handleConfirm}
        >
          Looks good — take me to Nexus ({includedCount} games)
        </Button>
      </div>
    </div>
  );
}
