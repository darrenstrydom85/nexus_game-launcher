import type { Game } from "@/stores/gameStore";
import { ActionBar } from "./ActionBar";
import { GameMetadata } from "./GameMetadata";
import { GamePlayStats } from "./GamePlayStats";
import { GameTrailer } from "./GameTrailer";
import { GameScreenshots } from "./GameScreenshots";
import { GameNotes } from "./GameNotes";
import { HltbSection } from "./HltbSection";
import { LiveOnTwitch } from "./LiveOnTwitch";
import { TwitchClipsRow } from "./TwitchClipsRow";
import { GameProgress } from "./GameProgress";
import { GameTagsSection } from "@/components/Tags/GameTagsSection";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { MasteryTierDetail } from "./MasteryTierDetail";
import { Plus } from "lucide-react";
import { useQueueStore } from "@/stores/queueStore";

/** Mockup 02: playtime measured against the HLTB main-story figure. */
function PlaytimeVsHltb({ game }: { game: Game }) {
  if (!game.hltbMainH || game.hltbMainH <= 0 || game.totalPlayTimeS <= 0) return null;
  const playedH = game.totalPlayTimeS / 3600;
  const pct = Math.round((playedH / game.hltbMainH) * 100);
  return (
    <div data-testid="detail-hltb-bar">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Playtime vs How Long To Beat</h3>
      <div className="h-1.5 rounded-full bg-foreground/10">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {playedH.toFixed(1)} hrs played · HLTB main {game.hltbMainH.toFixed(1)}
        {pct >= 100
          ? " — you're past the finish line and still going"
          : ` — ${pct}% of the main story`}
      </p>
    </div>
  );
}

/** Mockup 02: this game's place in the play queue. */
function QueueStatus({ gameId }: { gameId: string }) {
  const entries = useQueueStore((s) => s.entries);
  const idx = entries.findIndex((e) => e.gameId === gameId);
  if (idx < 0) return null;
  return (
    <div data-testid="detail-queue-status">
      <h3 className="mb-2 text-sm font-semibold text-foreground">Queue</h3>
      <p className="text-[12px] text-muted-foreground">
        Position {idx + 1} of {entries.length}
        {idx === 0 ? " — next up when you finish something" : ""}
      </p>
    </div>
  );
}

interface DetailContentProps {
  game: Game;
  isPlaying?: boolean;
  processDetected?: boolean;
  activeSessionStartedAt?: string | null;
  isArchived?: boolean;
  screenshots?: string[];
  youtubeId?: string | null;
  collections?: string[];
  onPlay?: () => void;
  onStop?: () => void;
  onForceIdentify?: () => void;
  onStatusChange?: (status: import("@/stores/gameStore").GameStatus) => void;
  onRatingChange?: (rating: number | null) => void;
  onEdit?: () => void;
  onRefetchMetadata?: () => void;
  onSearchMetadata?: () => void;
  onViewFullStats?: () => void;
  onAddToCollection?: () => void;
  onOpenFolder?: () => void;
  onHide?: () => void;
}

function GameInfoStrip({ game }: { game: Game }) {
  const hasCriticScore = game.criticScore != null && game.criticScore > 0;
  const hasCommunityScore = game.communityScore != null && game.communityScore > 0;
  const hasRatings = hasCriticScore || hasCommunityScore;
  const hasStripContent = hasRatings || game.releaseDate || game.genres.length > 0;

  if (!hasStripContent) return null;

  return (
    <div
      data-testid="game-info-strip"
      className="mx-6 mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-card px-5 py-3"
    >
      {hasRatings && (
        <div data-testid="ratings-section" className="flex items-center gap-3">
          {hasCriticScore && (
            <div className="flex items-center gap-2">
              <ScoreBadge
                score={game.criticScore!}
                count={game.criticScoreCount ?? undefined}
                size="sm"
                label="Critic score"
              />
              <span className="text-xs text-muted-foreground">Critic</span>
            </div>
          )}
          {hasCommunityScore && (
            <div className="flex items-center gap-2">
              <ScoreBadge
                score={game.communityScore!}
                count={game.communityScoreCount ?? undefined}
                size="sm"
                label="Community score"
              />
              <span className="text-xs text-muted-foreground">Community</span>
            </div>
          )}
          {(game.releaseDate || game.genres.length > 0) && (
            <div className="h-4 w-px bg-border" aria-hidden />
          )}
        </div>
      )}

      {game.releaseDate && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Released</span>
          <span data-testid="meta-release-date" className="text-xs font-medium text-foreground tabular-nums">
            {new Date(game.releaseDate).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          {game.genres.length > 0 && (
            <div className="h-4 w-px bg-border" aria-hidden />
          )}
        </div>
      )}

      {game.genres.length > 0 && (
        <div data-testid="meta-genres" className="flex flex-wrap items-center gap-1.5">
          {game.genres.map((g) => (
            <span
              key={g}
              className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
            >
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DetailContent({
  game,
  isPlaying,
  processDetected,
  activeSessionStartedAt,
  isArchived,
  screenshots = [],
  youtubeId = null,
  collections = [],
  onPlay,
  onStop,
  onForceIdentify,
  onStatusChange,
  onRatingChange,
  onEdit,
  onRefetchMetadata,
  onSearchMetadata,
  onViewFullStats,
  onAddToCollection,
  onOpenFolder,
  onHide,
}: DetailContentProps) {
  return (
    <div data-testid="detail-content">
      <ActionBar
        game={game}
        isPlaying={isPlaying}
        processDetected={processDetected}
        activeSessionStartedAt={activeSessionStartedAt}
        isArchived={isArchived}
        onPlay={onPlay}
        onStop={onStop}
        onForceIdentify={onForceIdentify}
        onStatusChange={onStatusChange}
        onRatingChange={onRatingChange}
        onEdit={onEdit}
        onRefetchMetadata={onRefetchMetadata}
        onSearchMetadata={onSearchMetadata}
        onAddToCollection={onAddToCollection}
        onOpenFolder={onOpenFolder}
        onHide={onHide}
      />

      <div className="flex gap-12 px-10 pb-10 pt-4" data-testid="detail-columns">
        {/* Left column — the play story: HLTB progress, sessions, about, media */}
        <div data-testid="detail-left-col" className="flex w-[60%] flex-col gap-6">
          <PlaytimeVsHltb game={game} />

          <GamePlayStats
            game={game}
            onViewFullStats={onViewFullStats}
          />

          {game.description && (
            <div data-testid="detail-description">
              <h3 className="mb-3 text-sm font-semibold text-foreground">About</h3>
              <div className="text-sm leading-relaxed text-muted-foreground">
                {game.description.split("\n").map((p, i) => (
                  <p key={i} className="mb-2 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}

          <GameMetadata game={game} />

          {screenshots.length > 0 && (
            <div>
              <GameScreenshots screenshots={screenshots} />
            </div>
          )}

          <GameTrailer youtubeId={youtubeId} />

          <TwitchClipsRow gameName={game.name} />
        </div>

        {/* Right column — status: HLTB figures, queue, notes, tags, mastery, live */}
        <div data-testid="detail-right-col" className="group flex w-[40%] flex-col gap-6">
          <HltbSection game={game} />
          <QueueStatus gameId={game.id} />
          <GameNotes game={game} />
          <GameTagsSection gameId={game.id} />

          {/* Collections */}
          <div data-testid="detail-collections">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Collections</h3>
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-foreground/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {c}
                </span>
              ))}
              <button
                data-testid="detail-add-collection"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-foreground/20 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
                onClick={onAddToCollection}
              >
                <Plus className="size-3" />
                Add
              </button>
            </div>
          </div>

          <MasteryTierDetail gameId={game.id} />
          <GameProgress game={game} onStatusChange={onStatusChange} />
          <LiveOnTwitch gameName={game.name} />
          <GameInfoStrip game={game} />
        </div>
      </div>
    </div>
  );
}
