import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useCeremonyStore } from "@/stores/ceremonyStore";
import { DotNavigation } from "@/components/Wrapped/DotNavigation";
import { CeremonyHeroCard } from "./CeremonyHeroCard";
import { CeremonyJourneyCard } from "./CeremonyJourneyCard";
import { CeremonySessionsCard } from "./CeremonySessionsCard";
import { CeremonyPatternsCard } from "./CeremonyPatternsCard";
import { CeremonyTimelineCard } from "./CeremonyTimelineCard";
import { CeremonyMasteryCard } from "./CeremonyMasteryCard";
import { CeremonyFunFactsCard } from "./CeremonyFunFactsCard";
import { CeremonyFinalCard } from "./CeremonyFinalCard";
import { CertificateShareModal } from "./CertificateShareModal";
import type { GameCeremonyData } from "@/lib/tauri";

/**
 * RetirementCeremony — full-screen scroll-snap overlay that plays after a
 * game is marked Completed or Dropped (Epic 41, Story 41.2). Also replayable
 * from the game detail overlay via `useCeremonyStore.openForGame`.
 *
 * Card visibility rules follow the spec (Section 3, AC 3): cards only render
 * when the data supports them, so short or empty histories never show a
 * half-empty chart.
 */

type CardDef = {
  id: string;
  shouldShow: (d: GameCeremonyData) => boolean;
};

const CARD_DEFS: CardDef[] = [
  { id: "hero", shouldShow: () => true },
  {
    id: "journey",
    shouldShow: (d) => d.totalSessions > 0,
  },
  {
    id: "sessions",
    shouldShow: (d) => d.totalSessions >= 1,
  },
  {
    id: "patterns",
    shouldShow: (d) =>
      d.playTimeByDayOfWeek.some((v) => v > 0) ||
      d.playTimeByHourOfDay.some((v) => v > 0),
  },
  {
    id: "timeline",
    shouldShow: (d) => d.playTimeByMonth.length >= 2,
  },
  {
    id: "mastery",
    shouldShow: () => true,
  },
  {
    id: "fun-facts",
    shouldShow: (d) => d.funFacts.length > 0,
  },
  { id: "final", shouldShow: () => true },
];

function getVisibleCards(data: GameCeremonyData): string[] {
  return CARD_DEFS.filter((def) => def.shouldShow(data)).map((d) => d.id);
}

function SkeletonCard() {
  return (
    <div
      data-testid="ceremony-skeleton"
      className="flex h-full flex-col items-center justify-center gap-6 px-8"
    >
      <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
      <div className="h-56 w-56 animate-pulse rounded-full bg-muted" />
      <div className="h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}

function ErrorState({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      data-testid="ceremony-error"
      className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"
    >
      <p className="text-5xl">⚠️</p>
      <h2 className="text-2xl font-bold text-foreground">
        Couldn't load the ceremony
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className={cn(
          "mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
          "transition-colors hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        Close
      </button>
    </div>
  );
}

export function RetirementCeremony() {
  const open = useCeremonyStore((s) => s.open);
  const loading = useCeremonyStore((s) => s.loading);
  const error = useCeremonyStore((s) => s.error);
  const data = useCeremonyStore((s) => s.data);
  const close = useCeremonyStore((s) => s.close);

  const shouldReduceMotion = useReducedMotion();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [shareOpen, setShareOpen] = React.useState(false);

  const visibleCards = React.useMemo(
    () => (data ? getVisibleCards(data) : []),
    [data],
  );

  // Reset active index when ceremony reopens with new data.
  React.useEffect(() => {
    if (open) {
      setActiveIndex(0);
      scrollRef.current?.scrollTo({ top: 0 });
    }
  }, [open, data?.gameId]);

  // Keyboard navigation
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (shareOpen) return;
        close();
        return;
      }
      if (!scrollRef.current) return;
      const container = scrollRef.current;
      const cardCount = container.querySelectorAll("[data-card]").length;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(activeIndex + 1, cardCount - 1);
        container.scrollTo({
          top: next * container.clientHeight,
          behavior: "smooth",
        });
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        const prev = Math.max(activeIndex - 1, 0);
        container.scrollTo({
          top: prev * container.clientHeight,
          behavior: "smooth",
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, close, activeIndex, shareOpen]);

  // Track active card via scroll position.
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
    updateActive();
    return () => container.removeEventListener("scroll", updateActive);
  }, [visibleCards.length, open]);

  if (!open) return null;

  const scrollToCard = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({
      top: index * container.clientHeight,
      behavior: "smooth",
    });
  };

  const heroArt = data?.heroArtUrl ?? data?.coverArtUrl ?? null;

  return (
    <>
      <div
        data-testid="retirement-ceremony"
        // z-[52]: sits above GameDetailOverlay (z-50) so the ceremony is
        // visible when replayed from a game's detail page, but below the
        // CertificateShareModal (z-[55]/[56]) so sharing still layers on top.
        // Full-viewport (no titlebar offset) so no underlying surface peeks
        // through at the top — matches GameDetailOverlay's fullscreen pattern.
        className="fixed inset-0 z-[52] flex flex-col bg-background"
        role="dialog"
        aria-label="Retirement ceremony"
        aria-modal="true"
      >
        {/* Ambient background art */}
        {heroArt && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <img
              src={heroArt}
              alt=""
              className="size-full object-cover opacity-10"
              style={{ filter: "blur(20px)" }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
          </div>
        )}

        {/* Top bar */}
        <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-border bg-background/60 px-4 py-2 backdrop-blur-sm">
          <h1 className="text-sm font-semibold text-foreground">
            {data ? data.gameName : "Retirement Ceremony"}
          </h1>
          <button
            type="button"
            data-testid="ceremony-close"
            onClick={close}
            aria-label="Close ceremony"
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
              style={{
                scrollSnapAlign: "start",
                height: "100%",
              }}
            >
              <SkeletonCard />
            </div>
          ) : error ? (
            <div
              data-card
              data-card-index={0}
              style={{
                scrollSnapAlign: "start",
                height: "100%",
              }}
            >
              <ErrorState message={error} onClose={close} />
            </div>
          ) : data ? (
            <AnimatePresence mode="wait">
              {visibleCards.map((cardId, i) => (
                <motion.div
                  key={`${cardId}-${data.gameId}`}
                  data-card
                  data-card-index={i}
                  initial={shouldReduceMotion ? {} : { opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.3, delay: i * 0.08 }
                  }
                  style={{
                    scrollSnapAlign: "start",
                    height: "100%",
                  }}
                  className={cn(
                    "relative overflow-hidden",
                    i % 2 === 0
                      ? "bg-background/30"
                      : "bg-gradient-to-b from-card/40 to-background/30",
                  )}
                >
                  {cardId === "hero" && <CeremonyHeroCard data={data} />}
                  {cardId === "journey" && (
                    <CeremonyJourneyCard data={data} />
                  )}
                  {cardId === "sessions" && (
                    <CeremonySessionsCard data={data} />
                  )}
                  {cardId === "patterns" && (
                    <CeremonyPatternsCard data={data} />
                  )}
                  {cardId === "timeline" && (
                    <CeremonyTimelineCard data={data} />
                  )}
                  {cardId === "mastery" && (
                    <CeremonyMasteryCard data={data} />
                  )}
                  {cardId === "fun-facts" && (
                    <CeremonyFunFactsCard data={data} />
                  )}
                  {cardId === "final" && (
                    <CeremonyFinalCard
                      data={data}
                      onClose={close}
                      onShare={() => setShareOpen(true)}
                    />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          ) : null}
        </div>

        {/* Dot navigation */}
        {data && !loading && !error && visibleCards.length > 1 && (
          <DotNavigation
            count={visibleCards.length}
            activeIndex={activeIndex}
            onDotClick={scrollToCard}
          />
        )}
      </div>

      {shareOpen && data && (
        <CertificateShareModal
          data={data}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
