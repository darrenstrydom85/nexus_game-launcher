import * as React from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore, type DetectedGame } from "@/stores/onboardingStore";
import { useGameStore, type Game, type GameSource } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { X, Check, RotateCcw } from "lucide-react";
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
    if (filterSource === "all") return confirmGames;
    return confirmGames.filter((g) => g.source === filterSource);
  }, [confirmGames, filterSource]);

  const includedCount = confirmGames.filter((g) => g.included).length;

  const toggleInclude = React.useCallback((id: string) => {
    setConfirmGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, included: !g.included } : g)),
    );
  }, []);

  const dismissGame = React.useCallback((id: string) => {
    setConfirmGames((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const updateName = React.useCallback((id: string, name: string) => {
    setConfirmGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, editedName: name } : g)),
    );
  }, []);

  const [confirmError, setConfirmError] = React.useState<string | null>(null);

  const handleConfirm = React.useCallback(async () => {
    setConfirmError(null);

    // Build the list to confirm by merging the raw DetectedGame data (which
    // carries sourceId, sourceFolderId, etc.) with any name edits the user made
    // in this step. Games the user excluded are omitted entirely.
    const detectedGames: DetectedGame[] = confirmGames
      .filter((g) => g.included)
      .map((g, _i) => {
        // The store preview games are indexed as "detected-0", "detected-1", …
        // so we can recover the original index to look up the raw detected game.
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
        };
      });

    try {
      await invoke("confirm_games", { detectedGames });
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

      {/* Game grid */}
      <div
        data-testid="confirm-game-grid"
        className="grid max-h-[50vh] gap-3 overflow-y-auto"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}
      >
        {filtered.map((game) => (
          <div
            key={game.id}
            data-testid={`confirm-card-${game.id}`}
            className={cn(
              "relative flex flex-col gap-2 rounded-lg border p-3 transition-opacity",
              game.included ? "border-border" : "border-border/50 opacity-50",
            )}
          >
            {/* Cover */}
            <div className="h-24 w-full overflow-hidden rounded">
              {game.coverUrl ? (
                <img src={game.coverUrl} alt={game.editedName} className="h-full w-full object-cover" />
              ) : (
                <div
                  className="flex h-full w-full items-center justify-center text-xs text-white/60"
                  style={{ background: placeholderGradient(game.editedName) }}
                >
                  {game.editedName.charAt(0)}
                </div>
              )}
            </div>

            {/* Editable name */}
            <input
              data-testid={`confirm-name-${game.id}`}
              className="w-full rounded border border-transparent bg-transparent px-1 text-sm font-medium text-foreground hover:border-border focus:border-ring focus:outline-none"
              value={game.editedName}
              onChange={(e) => updateName(game.id, e.target.value)}
            />

            {/* Source badge */}
            <span className="text-xs text-muted-foreground">
              {SOURCE_LABELS[game.source]}
            </span>

            {/* Controls */}
            <div className="flex items-center gap-1">
              <button
                data-testid={`confirm-toggle-${game.id}`}
                className={cn(
                  "flex size-6 items-center justify-center rounded",
                  game.included
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground",
                )}
                onClick={() => toggleInclude(game.id)}
                aria-label={game.included ? "Exclude" : "Include"}
              >
                <Check className="size-3.5" />
              </button>
              <button
                data-testid={`confirm-dismiss-${game.id}`}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                onClick={() => dismissGame(game.id)}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
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
