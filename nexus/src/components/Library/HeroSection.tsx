import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useUiStore } from "@/stores/uiStore";
import type { Game, GameSource } from "@/stores/gameStore";
import { Play, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

function formatPlayTime(totalSeconds: number): string {
  const s = totalSeconds || 0;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

interface HeroSectionProps {
  games: Game[];
  onPlay?: (game: Game) => void;
  onDetails?: (game: Game) => void;
}

export function HeroSection({ games, onPlay, onDetails }: HeroSectionProps) {
  const selectedGameId = useUiStore((s) => s.selectedGameId);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollY, setScrollY] = React.useState(0);

  const mostRecentlyPlayed = React.useMemo(() => {
    const sorted = [...games]
      .filter((g) => g.lastPlayedAt)
      .sort(
        (a, b) =>
          new Date(b.lastPlayedAt!).getTime() -
          new Date(a.lastPlayedAt!).getTime(),
      );
    return sorted[0] ?? games[0] ?? null;
  }, [games]);

  const activeGame = React.useMemo(() => {
    if (selectedGameId) return games.find((g) => g.id === selectedGameId) ?? mostRecentlyPlayed;
    return mostRecentlyPlayed;
  }, [selectedGameId, games, mostRecentlyPlayed]);

  React.useEffect(() => {
    const container = scrollRef.current?.parentElement;
    if (!container) return;
    const onScroll = () => setScrollY(container.scrollTop);
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (!activeGame) return null;

  return (
    <div
      ref={scrollRef}
      data-testid="hero-section"
      className="relative w-full shrink-0 overflow-hidden"
      style={{
        height: "clamp(300px, 45vh, 500px)",
      }}
    >
      {/* Parallax background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeGame.id}
          data-testid="hero-background"
          className="absolute inset-0"
          style={{
            transform: `translateY(${scrollY * 0.5}px)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: 0.5,
            ease: [0.4, 0, 0.2, 1],
          }}
        >
          {activeGame.heroUrl ? (
            <img
              src={activeGame.heroUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/20 to-background" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Bottom gradient fade */}
      <div
        data-testid="hero-gradient"
        className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent"
      />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,hsl(240,10%,4%)_100%)]" />

      {/* Overlay content */}
      <div
        data-testid="hero-overlay"
        className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6"
      >
        <div className="flex items-center gap-2">
          <span
            data-testid="hero-source-badge"
            className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
          >
            {SOURCE_LABELS[activeGame.source]}
          </span>
          {activeGame.genres.slice(0, 3).map((genre) => (
            <span
              key={genre}
              className="rounded-full bg-secondary/60 px-2 py-0.5 text-xs text-muted-foreground"
            >
              {genre}
            </span>
          ))}
        </div>

        <h2
          data-testid="hero-game-name"
          className="text-3xl font-bold tracking-tight text-foreground drop-shadow-lg"
        >
          {activeGame.logoUrl ? (
            <img
              src={activeGame.logoUrl}
              alt={activeGame.name}
              className="max-h-16 object-contain"
            />
          ) : (
            activeGame.name
          )}
        </h2>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {activeGame.totalPlayTimeS > 0 && (
            <span data-testid="hero-playtime">
              {formatPlayTime(activeGame.totalPlayTimeS)} played
            </span>
          )}
          {activeGame.status !== "unset" && (
            <span
              data-testid="hero-status"
              className="rounded-full bg-secondary px-2 py-0.5 text-xs capitalize"
            >
              {activeGame.status}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            data-testid="hero-play-button"
            className="gap-2 shadow-lg shadow-primary/25 transition-shadow hover:shadow-primary/40"
            onClick={() => onPlay?.(activeGame)}
          >
            <Play className="size-4" />
            Play
          </Button>
          <Button
            data-testid="hero-details-button"
            variant="secondary"
            className="gap-2"
            onClick={() => onDetails?.(activeGame)}
          >
            <Info className="size-4" />
            Details
          </Button>
        </div>
      </div>
    </div>
  );
}

export { formatPlayTime };
export type { HeroSectionProps };
