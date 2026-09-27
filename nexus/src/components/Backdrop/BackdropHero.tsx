import { motion, AnimatePresence } from "motion/react";
import { formatPlayTime } from "@/lib/utils";
import type { Game, GameSource } from "@/stores/gameStore";
import { useQueueStore } from "@/stores/queueStore";
import { useHeroGame } from "@/components/experience/useGameAccent";
import { Play } from "lucide-react";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

function relativeLastPlayed(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "last played today";
  if (days === 1) return "last played yesterday";
  if (days < 30) return `last played ${days} days ago`;
  return `last played ${new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

interface BackdropHeroProps {
  games: Game[];
  onPlay?: (game: Game) => void;
  onDetails?: (gameId: string) => void;
}

/**
 * The Backdrop stage: the selected game's key art is the interface.
 * Full-bleed hero with scrims, eyebrow, cinematic condensed title and the
 * accent-tinted play action. Selection comes from useHeroGame (explicit
 * selection, else most recently played).
 */
export function BackdropHero({ games, onPlay, onDetails }: BackdropHeroProps) {
  const game = useHeroGame(games);
  const isQueued = useQueueStore((s) => (game ? s.isQueued(game.id) : false));

  if (!game) return null;

  const art = game.heroUrl ?? game.coverUrl;
  const meta = [
    game.totalPlayTimeS > 0 ? `${formatPlayTime(game.totalPlayTimeS)} played` : "Not played yet",
    game.progress != null && game.progress > 0 ? `${game.progress}% complete` : null,
    relativeLastPlayed(game.lastPlayedAt),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      data-testid="backdrop-hero"
      className="relative w-full shrink-0 overflow-hidden"
      style={{ height: "clamp(380px, 56vh, 640px)" }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={game.id}
          data-testid="backdrop-hero-art"
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
        >
          {art ? (
            <img
              src={art}
              alt=""
              className="h-full w-full object-cover object-[center_25%]"
              draggable={false}
            />
          ) : (
            <div
              className="h-full w-full"
              style={{
                background:
                  "radial-gradient(700px 400px at 70% 20%, color-mix(in srgb, var(--game-accent, var(--primary)) 30%, transparent), transparent 65%), var(--background)",
              }}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Side + bottom scrims keep text legible over any art */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/75 via-background/15 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-background via-background/45 to-transparent" />

      <div className="absolute bottom-8 left-10 flex max-w-[70%] flex-col gap-2.5">
        <div
          data-testid="backdrop-hero-eyebrow"
          className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground"
        >
          Now selected · {SOURCE_LABELS[game.source]}
          {isQueued && " · Queued"}
        </div>
        <h1
          data-testid="backdrop-hero-title"
          className="font-display text-[64px] font-bold uppercase leading-[0.95] tracking-tight text-foreground drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]"
        >
          {game.name}
        </h1>
        <div data-testid="backdrop-hero-meta" className="text-[13px] text-foreground/75">
          {meta}
        </div>
        <div className="mt-2 flex items-center gap-2.5">
          <button
            data-testid="backdrop-hero-play"
            className="inline-flex items-center gap-2 rounded-md px-7 py-3 text-[13px] font-bold tracking-wide text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ background: "var(--game-accent, var(--primary))", color: "var(--background)" }}
            onClick={() => onPlay?.(game)}
          >
            <Play className="size-3.5 fill-current" />
            PLAY
          </button>
          <button
            data-testid="backdrop-hero-details"
            className="rounded-md border border-foreground/30 bg-background/30 px-5 py-3 text-[13px] font-semibold text-foreground transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onDetails?.(game.id)}
          >
            Details
          </button>
          <button
            data-testid="backdrop-hero-queue"
            className="rounded-md border border-foreground/15 bg-background/20 px-4 py-3 text-[13px] text-foreground/70 transition-colors hover:bg-background/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              const qs = useQueueStore.getState();
              if (qs.isQueued(game.id)) qs.remove(game.id, game.name);
              else qs.add(game.id, game.name);
            }}
          >
            {isQueued ? "In queue ✓" : "+ Queue"}
          </button>
        </div>
      </div>
    </div>
  );
}
