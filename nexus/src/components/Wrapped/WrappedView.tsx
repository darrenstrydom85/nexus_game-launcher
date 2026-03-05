import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWrapped } from "@/hooks/useWrapped";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { DotNavigation } from "./DotNavigation";
import { PeriodSelector } from "./PeriodSelector";
import { HeroCard } from "./HeroCard";
import { TopGameCard } from "./TopGameCard";
import { TopGamesCard } from "./TopGamesCard";
import { GenreCard } from "./GenreCard";
import { PlayPatternsCard } from "./PlayPatternsCard";
import { MilestonesCard } from "./MilestonesCard";
import { DiversityCard } from "./DiversityCard";
import { LibraryGrowthCard } from "./LibraryGrowthCard";
import { FunExtrasCard } from "./FunExtrasCard";
import type { WrappedReport } from "@/types/wrapped";

interface WrappedViewProps {
  onClose: () => void;
}

function SkeletonCard() {
  return (
    <div
      data-testid="wrapped-skeleton"
      className="flex h-full flex-col items-center justify-center gap-6 px-8"
    >
      <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
      <div className="h-56 w-56 animate-pulse rounded-full bg-muted" />
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function EmptyState({ periodLabel }: { periodLabel: string }) {
  return (
    <div
      data-testid="wrapped-empty"
      className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <p className="text-5xl">🎮</p>
      <h2 className="text-2xl font-bold text-foreground">
        No play data for {periodLabel}
      </h2>
      <p className="max-w-sm text-muted-foreground">
        Start playing some games and come back to see your Wrapped!
      </p>
    </div>
  );
}

type CardDef =
  | { id: string; alwaysShow: true }
  | { id: string; alwaysShow: false; hasData: (r: WrappedReport) => boolean };

const CARD_DEFS: CardDef[] = [
  { id: "hero", alwaysShow: true },
  { id: "top-game", alwaysShow: false, hasData: (r) => r.mostPlayedGame !== null },
  { id: "top-games", alwaysShow: false, hasData: (r) => r.topGames.length > 0 },
  { id: "genre", alwaysShow: false, hasData: (r) => r.genreBreakdown.length > 0 },
  { id: "patterns", alwaysShow: false, hasData: (r) => r.playTimeByDayOfWeek.some((b) => b.playTimeS > 0) },
  { id: "milestones", alwaysShow: false, hasData: (r) => r.longestStreakDays > 0 || r.longestSession !== null },
  { id: "diversity", alwaysShow: false, hasData: (r) => r.platformBreakdown.length > 0 || r.newTitlesInPeriod > 0 },
  { id: "library-growth", alwaysShow: true },
  { id: "fun-extras", alwaysShow: false, hasData: (r) => Boolean(r.moodTagline) || Boolean(r.hiddenGem) || r.trivia.length > 0 },
];

function getVisibleCards(report: WrappedReport): string[] {
  return CARD_DEFS.filter((def) =>
    def.alwaysShow ? true : def.hasData(report),
  ).map((d) => d.id);
}

export function WrappedView({ onClose }: WrappedViewProps) {
  const { report, available, loading, selection, setSelection } = useWrapped();
  const shouldReduceMotion = useReducedMotion();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const visibleCards = React.useMemo(
    () => (report ? getVisibleCards(report) : []),
    [report],
  );

  const isEmpty = report !== null && report.totalSessions === 0;

  // Keyboard navigation
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const cardCount = container.querySelectorAll("[data-card]").length;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, cardCount - 1);
        container.scrollTo({ top: next * container.clientHeight, behavior: "smooth" });
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        container.scrollTo({ top: prev * container.clientHeight, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, activeIndex]);

  // Track active card via scroll position — more reliable than IntersectionObserver
  // with scroll-snap containers in Tauri's WebView.
  React.useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const updateActive = () => {
      const cardHeight = container.clientHeight;
      if (cardHeight === 0) return;
      const idx = Math.round(container.scrollTop / cardHeight);
      setActiveIndex(Math.max(0, Math.min(idx, visibleCards.length - 1)));
    };

    container.addEventListener("scroll", updateActive, { passive: true });
    // Run once on mount so the initial card is highlighted
    updateActive();
    return () => container.removeEventListener("scroll", updateActive);
  }, [visibleCards.length]);

  const scrollToCard = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: index * container.clientHeight, behavior: "smooth" });
  };

  return (
    <div
      data-testid="wrapped-view"
      className="fixed inset-0 z-[45] flex flex-col bg-background"
      style={{ top: "var(--titlebar-height, 36px)" }}
      role="dialog"
      aria-label="Library Wrapped"
      aria-modal="true"
    >
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold text-foreground">My Wrapped</h1>
          {!loading && (
            <PeriodSelector
              selection={selection}
              available={available}
              onChange={(sel) => {
                setSelection(sel);
                setActiveIndex(0);
                scrollRef.current?.scrollTo({ top: 0 });
              }}
            />
          )}
        </div>
        <button
          type="button"
          data-testid="wrapped-close"
          onClick={onClose}
          aria-label="Close Wrapped"
          className={cn(
            "flex size-8 items-center justify-center rounded-md",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Scrollable card area */}
      <div
        ref={scrollRef}
        className="relative flex-1 overflow-y-scroll"
        style={{ scrollSnapType: "y mandatory" }}
      >
        {loading ? (
          <div
            data-card
            data-card-index={0}
            style={{ scrollSnapAlign: "start", height: "calc(100vh - var(--titlebar-height, 36px) - 44px)" }}
          >
            <SkeletonCard />
          </div>
        ) : isEmpty ? (
          <div
            data-card
            data-card-index={0}
            style={{ scrollSnapAlign: "start", height: "calc(100vh - var(--titlebar-height, 36px) - 44px)" }}
          >
            <EmptyState periodLabel={report?.periodLabel ?? "this period"} />
          </div>
        ) : report ? (
          <AnimatePresence mode="wait">
            {visibleCards.map((cardId, i) => (
              <motion.div
                key={`${cardId}-${selection.kind === "preset" ? selection.preset : selection.kind === "year" ? selection.year : "custom"}`}
                data-card
                data-card-index={i}
                initial={shouldReduceMotion ? {} : { opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.3, delay: i * 0.1 }
                }
                style={{
                  scrollSnapAlign: "start",
                  height: "calc(100vh - var(--titlebar-height, 36px) - 44px)",
                }}
                className={cn(
                  "relative overflow-hidden",
                  i % 2 === 0
                    ? "bg-background"
                    : "bg-gradient-to-b from-card/40 to-background",
                )}
              >
                {cardId === "hero" && <HeroCard report={report} />}
                {cardId === "top-game" && <TopGameCard report={report} />}
                {cardId === "top-games" && (
                  <TopGamesCard report={report} isVisible={activeIndex === i} />
                )}
                {cardId === "genre" && <GenreCard report={report} />}
                {cardId === "patterns" && <PlayPatternsCard report={report} />}
                {cardId === "milestones" && <MilestonesCard report={report} />}
                {cardId === "diversity" && <DiversityCard report={report} />}
                {cardId === "library-growth" && (
                  <LibraryGrowthCard report={report} />
                )}
                {cardId === "fun-extras" && <FunExtrasCard report={report} />}
              </motion.div>
            ))}
          </AnimatePresence>
        ) : null}
      </div>

      {/* Dot navigation */}
      {!loading && !isEmpty && visibleCards.length > 1 && (
        <DotNavigation
          count={visibleCards.length}
          activeIndex={activeIndex}
          onDotClick={scrollToCard}
        />
      )}
    </div>
  );
}
