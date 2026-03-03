import * as React from "react";
import { RefreshCw, ExternalLink } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import type { Game } from "@/stores/gameStore";
import { fetchHltb } from "@/lib/tauri";
import { formatHltbTime } from "@/lib/utils";
import { useGameStore } from "@/stores/gameStore";

interface HltbRowProps {
  label: string;
  ariaLabel: string;
  seconds: number | null;
  loading: boolean;
}

function HltbRow({ label, ariaLabel, seconds, loading }: HltbRowProps) {
  const formatted = formatHltbTime(seconds);

  return (
    <div className="flex justify-between" aria-label={ariaLabel}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground tabular-nums">
        {loading ? (
          <span className="inline-block h-3 w-12 animate-pulse rounded bg-muted" />
        ) : formatted != null ? (
          formatted
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  );
}

interface HltbSectionProps {
  game: Game;
}

export function HltbSection({ game }: HltbSectionProps) {
  const [loading, setLoading] = React.useState(false);
  const [localMain, setLocalMain] = React.useState(game.hltbMainS ?? null);
  const [localPlus, setLocalPlus] = React.useState(game.hltbMainPlusS ?? null);
  const [local100, setLocal100] = React.useState(game.hltbCompletionistS ?? null);
  const [localGameId, setLocalGameId] = React.useState(game.hltbGameId ?? null);
  const setGames = useGameStore((s) => s.setGames);
  const games = useGameStore((s) => s.games);

  // Sync from game prop when it changes externally
  React.useEffect(() => {
    setLocalMain(game.hltbMainS ?? null);
    setLocalPlus(game.hltbMainPlusS ?? null);
    setLocal100(game.hltbCompletionistS ?? null);
    setLocalGameId(game.hltbGameId ?? null);
  }, [game.hltbMainS, game.hltbMainPlusS, game.hltbCompletionistS, game.hltbGameId]);

  // Sentinel -1 means "searched but not found" — treat as no data for display
  const displayMain = localMain != null && localMain > 0 ? localMain : null;
  const displayPlus = localPlus != null && localPlus > 0 ? localPlus : null;
  const display100 = local100 != null && local100 > 0 ? local100 : null;

  const allNull = displayMain == null && displayPlus == null && display100 == null;

  // Hide section entirely if all values are null and we haven't fetched yet
  // (hltbMainS === null means never fetched; -1 means fetched but not found)
  const neverFetched = game.hltbMainS == null;
  if (allNull && !loading && neverFetched) return null;

  const handleRefetch = React.useCallback(async () => {
    setLoading(true);
    try {
      await fetchHltb(game.id);
      // Reload games to get updated data
      const { invoke } = await import("@tauri-apps/api/core");
      const updatedGames = await invoke<Game[]>("get_games");
      setGames(updatedGames);
      const updated = updatedGames.find((g) => g.id === game.id);
      if (updated) {
        setLocalMain(updated.hltbMainS ?? null);
        setLocalPlus(updated.hltbMainPlusS ?? null);
        setLocal100(updated.hltbCompletionistS ?? null);
        setLocalGameId(updated.hltbGameId ?? null);
      }
    } catch (e) {
      console.error("HLTB re-fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [game.id, setGames, games]);

  const handleAttributionClick = React.useCallback(() => {
    if (localGameId == null) return;
    open(`https://howlongtobeat.com/game/${localGameId}`).catch(console.error);
  }, [localGameId]);

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      aria-label="How Long to Beat estimates"
      data-testid="hltb-section"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">How Long to Beat</h3>
          {localGameId != null && (
            <button
              data-testid="hltb-attribution-link"
              onClick={handleAttributionClick}
              className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground"
              aria-label="View on HowLongToBeat"
            >
              via HowLongToBeat
              <ExternalLink className="ml-0.5 size-3" />
            </button>
          )}
        </div>
        <button
          data-testid="hltb-refetch-button"
          onClick={handleRefetch}
          disabled={loading}
          className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 focus:opacity-100 disabled:cursor-not-allowed"
          aria-label="Re-fetch HowLongToBeat data"
          title="Re-fetch HowLongToBeat data"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <dl className="flex flex-col gap-2.5 text-sm">
        <HltbRow
          label="Main Story"
          ariaLabel={displayMain != null ? `Main story: ${formatHltbTime(displayMain)}` : "Main story: not available"}
          seconds={displayMain}
          loading={loading}
        />
        <HltbRow
          label="Main + Extras"
          ariaLabel={displayPlus != null ? `Main plus extras: ${formatHltbTime(displayPlus)}` : "Main plus extras: not available"}
          seconds={displayPlus}
          loading={loading}
        />
        <HltbRow
          label="Completionist"
          ariaLabel={display100 != null ? `Completionist: ${formatHltbTime(display100)}` : "Completionist: not available"}
          seconds={display100}
          loading={loading}
        />
      </dl>
    </div>
  );
}
