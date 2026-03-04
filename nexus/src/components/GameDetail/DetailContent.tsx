import type { Game } from "@/stores/gameStore";
import { ActionBar } from "./ActionBar";
import { GameMetadata } from "./GameMetadata";
import { GamePlayStats } from "./GamePlayStats";
import { GameTrailer } from "./GameTrailer";
import { GameScreenshots } from "./GameScreenshots";
import { LiveOnTwitch } from "./LiveOnTwitch";
import { ScoreBadge } from "@/components/shared/ScoreBadge";
import { Plus } from "lucide-react";

interface DetailContentProps {
  game: Game;
  isPlaying?: boolean;
  screenshots?: string[];
  youtubeId?: string | null;
  collections?: string[];
  onPlay?: () => void;
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
  screenshots = [],
  youtubeId = null,
  collections = [],
  onPlay,
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
        onPlay={onPlay}
        onStatusChange={onStatusChange}
        onRatingChange={onRatingChange}
        onEdit={onEdit}
        onRefetchMetadata={onRefetchMetadata}
        onSearchMetadata={onSearchMetadata}
        onAddToCollection={onAddToCollection}
        onOpenFolder={onOpenFolder}
        onHide={onHide}
      />

      {/* Full-width info strip: scores + release date + genres */}
      <GameInfoStrip game={game} />

      <div className="flex gap-6 px-6 pb-6" data-testid="detail-columns">
        {/* Left column — content: about + game info + play stats + collections */}
        <div data-testid="detail-left-col" className="flex w-[60%] flex-col gap-4">
          {game.description && (
            <div data-testid="detail-description" className="rounded-lg border border-border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold text-foreground">About</h3>
              <div className="text-sm leading-relaxed text-muted-foreground">
                {game.description.split("\n").map((p, i) => (
                  <p key={i} className="mb-2 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          )}

          <LiveOnTwitch gameName={game.name} />

          <GameMetadata game={game} />

          {/* Collections card */}
          <div data-testid="detail-collections" className="rounded-lg border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Collections</h3>
            <div className="flex flex-wrap gap-1.5">
              {collections.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground"
                >
                  {c}
                </span>
              ))}
              <button
                data-testid="detail-add-collection"
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                onClick={onAddToCollection}
              >
                <Plus className="size-3" />
                Add
              </button>
            </div>
          </div>

          {screenshots.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <GameScreenshots screenshots={screenshots} />
            </div>
          )}
        </div>

        {/* Right column — 40%: play stats + trailer */}
        <div data-testid="detail-right-col" className="group flex w-[40%] flex-col gap-4">
          <GamePlayStats
            game={game}
            onViewFullStats={onViewFullStats}
          />
          <GameTrailer youtubeId={youtubeId} />
        </div>
      </div>
    </div>
  );
}
