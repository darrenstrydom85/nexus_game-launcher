import * as React from "react";
import { TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { TrendingGameCard } from "./TrendingGameCard";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const MIN_GAMES_TO_SHOW = 3;
const MAX_GAMES_DISPLAY = 10;

export function TrendingInLibrary() {
  const reduceMotion = useReducedMotion();
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const {
    isAuthenticated,
    trendingGames,
    trendingLoading,
  } = useTwitchStore();

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(
      el.scrollLeft < el.scrollWidth - el.clientWidth - 1,
    );
  }, []);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState);
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      ro.disconnect();
    };
  }, [updateScrollState, trendingGames?.length ?? 0]);

  const scroll = React.useCallback((dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = 100;
    el.scrollBy({
      left: dir === "left" ? -amount : amount,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [reduceMotion]);

  if (!twitchEnabled || !isAuthenticated) return null;
  const games = trendingGames ?? [];
  if (games.length < MIN_GAMES_TO_SHOW) return null;
  const displayGames = games.slice(0, MAX_GAMES_DISPLAY);

  return (
    <section
      className="mb-8"
      aria-labelledby="trending-in-library-heading"
    >
      <h2
        id="trending-in-library-heading"
        className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground"
      >
        <TrendingUp className="size-4 shrink-0" aria-hidden />
        Trending in Your Library
      </h2>
      {trendingLoading && displayGames.length === 0 ? (
        <div className="flex gap-3 overflow-hidden">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-[120px] w-[80px] shrink-0 animate-pulse rounded-md bg-muted"
              style={{ aspectRatio: "80/120" }}
            />
          ))}
        </div>
      ) : (
        <div className="relative group">
          <button
            type="button"
            onClick={() => scroll("left")}
            className="absolute left-0 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-0 md:opacity-0 md:group-hover:opacity-100"
            disabled={!canScrollLeft}
            aria-label="Scroll left"
          >
            <ChevronLeft className="size-6 text-foreground" aria-hidden />
          </button>
          <div
            ref={scrollRef}
            role="list"
            aria-label="Games in your library trending on Twitch"
            className={`flex gap-3 overflow-x-auto scrollbar-hide ${reduceMotion ? "" : "scroll-smooth"}`}
            style={{
              scrollSnapType: reduceMotion ? "none" : "x mandatory",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {displayGames.map((game) => (
              <TrendingGameCard key={game.gameId} game={game} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="absolute right-0 top-1/2 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 backdrop-blur transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-0 md:opacity-0 md:group-hover:opacity-100"
            disabled={!canScrollRight}
            aria-label="Scroll right"
          >
            <ChevronRight className="size-6 text-foreground" aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}
