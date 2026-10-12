import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, animate, motion, useMotionValue } from "motion/react";
import { ChevronLeft, ChevronRight, Gamepad2, Pause, Play, Share2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { useWrapped, type PeriodSelection } from "@/hooks/useWrapped";
import type { WrappedReport } from "@/types/wrapped";
import type { WatchAggregate } from "@/lib/tauri";
import { PeriodSelector, selectionLabel } from "./PeriodSelector";
import { StoryProgress } from "./StoryProgress";
import { WrappedShareModal } from "./WrappedShareModal";
import { Backdrop } from "./StoryPrimitives";
import { SLIDE_MS, StoryDirection, useStoryReducedMotion } from "./storyMotion";
import { buildSlides, type SlideId } from "./slideDefs";
import { periodPhrase } from "./format";
import { useTwitchWatch } from "./useTwitchWatch";
import { IntroSlide } from "./slides/IntroSlide";
import { TopGameSlide } from "./slides/TopGameSlide";
import { TopGamesSlide } from "./slides/TopGamesSlide";
import { GenresSlide } from "./slides/GenresSlide";
import { RhythmSlide } from "./slides/RhythmSlide";
import { MilestonesSlide } from "./slides/MilestonesSlide";
import { VarietySlide } from "./slides/VarietySlide";
import { LibrarySlide } from "./slides/LibrarySlide";
import { ExtrasSlide } from "./slides/ExtrasSlide";
import { TwitchSlide } from "./slides/TwitchSlide";
import { OutroSlide } from "./slides/OutroSlide";

interface WrappedViewProps {
  onClose: () => void;
}

const chromeButton = cn(
  "inline-flex size-9 items-center justify-center rounded-full bg-white/12 text-white",
  "transition-colors duration-150 hover:bg-white/20",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
  // aria-disabled rather than disabled, so a focused Next button keeps focus at the end.
  "aria-disabled:cursor-default aria-disabled:opacity-40 aria-disabled:hover:bg-white/12",
);

function usePageHidden(): boolean {
  const [hidden, setHidden] = React.useState(() => typeof document !== "undefined" && document.visibilityState === "hidden");
  React.useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return hidden;
}

const isEditable = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

/** A press longer than this is a hold (pause), not a tap (navigate). */
const HOLD_MS = 250;

const INTERACTIVE = "button, a, input, select, textarea, [role='button'], [role='link']";

/** "This month" → "this month" for use mid-sentence; years and dates stay as they are. */
const inSentence = (label: string) => (/^(this|last) /i.test(label) ? label.toLowerCase() : label);

// ── States (all inside the frame, so the period pill stays usable) ─────────

function SkeletonStage() {
  return (
    <div data-testid="wrapped-skeleton" aria-busy="true" aria-label="Loading your Wrapped" className="absolute inset-0">
      <Backdrop slide="intro" still />
      <div className="relative mx-auto flex h-full w-full max-w-6xl flex-col justify-center gap-5 px-6 pb-24 pt-28 sm:px-12 lg:px-16">
        <div className="h-3 w-44 rounded-full bg-white/12" />
        <div className="h-16 w-[min(36rem,85%)] rounded-2xl bg-white/12" />
        <div className="h-16 w-[min(26rem,60%)] rounded-2xl bg-white/12" />
        <div className="mt-8 flex gap-8">
          <div className="h-24 w-48 rounded-2xl bg-white/[0.08]" />
          <div className="h-24 w-28 rounded-2xl bg-white/[0.08]" />
          <div className="h-24 w-28 rounded-2xl bg-white/[0.08]" />
        </div>
      </div>
    </div>
  );
}

function StateMessage({
  icon,
  title,
  children,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <div data-testid={testId} className="absolute inset-0">
      <Backdrop slide="outro" still />
      <div className="relative flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-white/10">{icon}</span>
        <h2 className="text-balance text-3xl font-bold tracking-[-0.03em] text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ── View ────────────────────────────────────────────────────────────────────

/**
 * My Wrapped as a story: one full-screen slide at a time with a segmented
 * progress bar, keyboard/click navigation and optional autoplay.
 */
export function WrappedView({ onClose }: WrappedViewProps) {
  const { report, available, loading, error, selection, setSelection } = useWrapped();
  const twitch = useTwitchWatch(selection);
  const reduced = useStoryReducedMotion();
  const pageHidden = usePageHidden();
  const frameRef = React.useRef<HTMLDivElement>(null);
  const nextRef = React.useRef<HTMLButtonElement>(null);
  const shareReturnRef = React.useRef<HTMLElement | null>(null);
  const stageId = React.useId();
  const hintId = React.useId();

  const hasStory = !loading && !error && report !== null && report.totalSessions > 0;
  const slides = React.useMemo(
    () => (hasStory && report ? buildSlides(report, twitch) : []),
    [hasStory, report, twitch],
  );
  const [activeId, setActiveId] = React.useState<SlideId>("intro");
  const [direction, setDirection] = React.useState<1 | -1>(1);
  const [playing, setPlaying] = React.useState(false);
  // Story-style: pressing and holding on the stage holds the current slide.
  const [held, setHeld] = React.useState(false);
  const pressStartRef = React.useRef<number | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);

  const found = slides.findIndex((s) => s.id === activeId);
  const index = found === -1 ? 0 : found;
  const count = slides.length;
  const current = slides[index];
  const selKey = JSON.stringify(selection);

  const goTo = React.useCallback(
    (i: number) => {
      if (count === 0) return;
      const target = Math.max(0, Math.min(count - 1, i));
      if (target === index) return;
      setDirection(target > index ? 1 : -1);
      setActiveId(slides[target].id);
    },
    [count, index, slides],
  );
  const next = React.useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = React.useCallback(() => goTo(index - 1), [goTo, index]);

  const changePeriod = (sel: PeriodSelection) => {
    setSelection(sel);
    setDirection(1);
    setActiveId("intro");
  };

  const openShare = React.useCallback(() => {
    shareReturnRef.current = document.activeElement as HTMLElement | null;
    setShareOpen(true);
  }, []);
  const closeShare = React.useCallback(() => {
    setShareOpen(false);
    shareReturnRef.current?.focus();
  }, []);

  const replay = () => {
    setDirection(1);
    setActiveId("intro");
    nextRef.current?.focus();
  };

  const togglePlay = () => {
    if (playing) return setPlaying(false);
    // Playing from the last slide starts the story over.
    if (index === count - 1) {
      setDirection(1);
      setActiveId("intro");
    }
    setPlaying(true);
  };

  // ── Autoplay ─────────────────────────────────────────────────────────────
  // A timer advances the story; the same remaining time drives the current
  // progress segment so the two stay in step through every pause. Play/Pause
  // is the control; besides it, autoplay only holds while the stage is pressed
  // and held, the window is hidden, or the share dialog is open. (Hover and
  // focus don't pause: the stage fills the view, so the pointer is always on it.)
  const motionProgress = useMotionValue(0);
  // Pinned to the first instance so the clock effects below never restart on identity alone.
  const progress = React.useRef(motionProgress).current;
  const remainingRef = React.useRef(SLIDE_MS);
  const running = playing && hasStory && !held && !pageHidden && !shareOpen && index < count - 1;

  // A new slide (or period) starts the clock over. Declared before the timer
  // effect so it runs first on the same commit.
  React.useEffect(() => {
    remainingRef.current = SLIDE_MS;
    progress.set(0);
  }, [activeId, selKey, progress]);

  React.useEffect(() => {
    if (!running) return;
    const ms = remainingRef.current;
    const startedAt = Date.now();
    const timer = window.setTimeout(next, ms);
    const controls = reduced ? null : animate(progress, 1, { duration: ms / 1000, ease: "linear" });
    return () => {
      window.clearTimeout(timer);
      controls?.stop();
      remainingRef.current = Math.max(0, ms - (Date.now() - startedAt));
    };
  }, [running, next, reduced, progress]);

  // Reaching the last slide ends autoplay.
  React.useEffect(() => {
    if (count > 0 && index === count - 1) setPlaying(false);
  }, [index, count]);

  // ── Keyboard ─────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (shareOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          closeShare();
        }
        return;
      }
      const target = e.target instanceof Element ? e.target : null;
      // Keys aimed at something outside this view (a popover, the top bar search) aren't ours.
      if (target && target !== document.body && !frameRef.current?.contains(target)) return;
      if (isEditable(target)) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (!hasStory) return;
      switch (e.key) {
        case "ArrowRight":
          next();
          break;
        case "ArrowLeft":
          prev();
          break;
        case "Home":
          goTo(0);
          break;
        case "End":
          goTo(count - 1);
          break;
        case " ":
          // Space on a focused button presses that button.
          if (target?.closest(INTERACTIVE)) return;
          next();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shareOpen, closeShare, onClose, hasStory, next, prev, goTo, count]);

  // ── Click zones: left third goes back, the rest goes forward ─────────────
  // A press-and-hold pauses instead, and its release is not a click.
  const onStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasStory || e.button > 0 || (e.target as Element).closest(INTERACTIVE)) return;
    pressStartRef.current = Date.now();
    setHeld(true);
  };
  const releaseHold = () => setHeld(false);

  const onStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const pressedAt = pressStartRef.current;
    pressStartRef.current = null;
    if (!hasStory) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    if (pressedAt !== null && Date.now() - pressedAt >= HOLD_MS) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width > 0 && e.clientX - rect.left < rect.width / 3) prev();
    else next();
  };

  const renderSlide = (id: SlideId, r: WrappedReport, watch: WatchAggregate | null) => {
    switch (id) {
      case "intro":
        return <IntroSlide report={r} />;
      case "top-game":
        return <TopGameSlide report={r} />;
      case "top-games":
        return <TopGamesSlide report={r} />;
      case "genres":
        return <GenresSlide report={r} />;
      case "rhythm":
        return <RhythmSlide report={r} />;
      case "milestones":
        return <MilestonesSlide report={r} />;
      case "variety":
        return <VarietySlide report={r} />;
      case "library":
        return <LibrarySlide report={r} />;
      case "extras":
        return <ExtrasSlide report={r} />;
      case "twitch":
        return watch ? <TwitchSlide watch={watch} periodLabel={r.periodLabel} /> : null;
      case "outro":
        return <OutroSlide report={r} onShare={openShare} onReplay={replay} />;
    }
  };

  const periodText = report?.periodLabel ?? selectionLabel(selection);
  const story = hasStory && report && current;

  return (
    <div
      ref={frameRef}
      data-testid="wrapped-view"
      className="relative isolate h-full min-h-[520px] w-full overflow-hidden bg-[rgb(10_9_16)] text-white [color-scheme:dark]"
    >
      <h1 className="sr-only">My Wrapped</h1>

      {/* Stage. Keyboard users get the arrow keys and the Previous/Next buttons;
          pointer users can also click anywhere (buttons inside slides keep their own clicks). */}
      <div
        id={stageId}
        data-testid="wrapped-stage"
        {...(story
          ? {
              role: "region",
              "aria-roledescription": "carousel",
              "aria-label": `Your ${periodPhrase(report.periodLabel)} in games`,
              "aria-describedby": hintId,
            }
          : {})}
        className={cn("absolute inset-0", story && "cursor-pointer select-none")}
        onClick={onStageClick}
        onPointerDown={onStagePointerDown}
        onPointerUp={releaseHold}
        onPointerCancel={releaseHold}
        onPointerLeave={releaseHold}
      >
        {loading ? (
          <SkeletonStage />
        ) : error || !report ? (
          <StateMessage
            testId="wrapped-error"
            icon={<TriangleAlert className="size-7 text-white/85" aria-hidden="true" />}
            title="Something went wrong"
          >
            <p className="max-w-sm text-sm text-white/85">
              {error ?? "No data available for this period. Try selecting a different date range."}
            </p>
            <button
              type="button"
              onClick={() => setSelection({ ...selection })}
              className="mt-2 inline-flex h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-[rgb(12_10_20)] transition-colors duration-150 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(12_10_20)]"
            >
              Try again
            </button>
          </StateMessage>
        ) : !story ? (
          <StateMessage
            testId="wrapped-empty"
            icon={<Gamepad2 className="size-7 text-white/85" aria-hidden="true" />}
            title={`No play data for ${inSentence(periodText)}`}
          >
            <p className="max-w-sm text-white/85">
              Pick another period from the menu at the top, or play something and come back.
            </p>
          </StateMessage>
        ) : (
          <StoryDirection.Provider value={direction}>
            <AnimatePresence>
              <motion.div
                key={`${selKey}:${current.id}`}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}: ${current.title}`}
                data-testid={`wrapped-slide-${current.id}`}
                className="absolute inset-0 overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: reduced ? { duration: 0.15 } : { duration: 0.4, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              >
                {renderSlide(current.id, report, twitch)}
              </motion.div>
            </AnimatePresence>
          </StoryDirection.Provider>
        )}
      </div>

      {story && (
        <>
          <p id={hintId} className="sr-only">
            Use the left and right arrow keys, or the Previous and Next buttons, to move between slides. While
            autoplay runs, press and hold a slide to pause it.
          </p>
          <div data-testid="wrapped-live" aria-live="polite" aria-atomic="true" className="sr-only">
            {`${current.title}, slide ${index + 1} of ${count}`}
          </div>
        </>
      )}

      {/* Top chrome: progress, period, actions. Empty areas let clicks through to the stage. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-[rgb(6_5_12/0.7)] to-transparent px-4 pb-8 pt-1.5 sm:px-6">
        {story && (
          <div className="pointer-events-auto">
            <StoryProgress
              titles={slides.map((s) => s.title)}
              index={index}
              progress={playing && !reduced ? progress : null}
              onJump={goTo}
            />
          </div>
        )}
        <div className={cn("flex items-center justify-between gap-3", !story && "pt-3")}>
          <div className="pointer-events-auto">
            <PeriodSelector selection={selection} available={available} onChange={changePeriod} />
          </div>
          <div className="pointer-events-auto flex items-center gap-1.5">
            {story && (
              <>
                <button
                  type="button"
                  data-testid="wrapped-save-image"
                  onClick={openShare}
                  aria-label="Share your Wrapped"
                  className={chromeButton}
                >
                  <Share2 className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  data-testid="wrapped-autoplay"
                  onClick={togglePlay}
                  aria-label={playing ? "Pause autoplay" : "Play autoplay"}
                  className={chromeButton}
                >
                  {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
                </button>
              </>
            )}
            <button
              type="button"
              data-testid="wrapped-close"
              onClick={onClose}
              aria-label="Close Wrapped"
              aria-keyshortcuts="Escape"
              className={chromeButton}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {story && (
        <>
          {index === 0 && (
            <p aria-hidden="true" className="pointer-events-none absolute bottom-7 left-6 z-20 hidden text-sm text-white/80 sm:block sm:left-12 lg:left-16">
              {playing ? "Press and hold to pause" : "Click or press → to continue"}
            </p>
          )}
          <div className="absolute bottom-5 right-5 z-20 flex items-center gap-3 sm:bottom-6 sm:right-6">
            <span aria-hidden="true" className="text-sm font-medium tabular-nums text-white/80">
              {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
            </span>
            <button
              type="button"
              data-testid="wrapped-prev"
              onClick={prev}
              aria-disabled={index === 0}
              aria-label="Previous slide"
              aria-controls={stageId}
              className={cn(chromeButton, "size-11")}
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button
              ref={nextRef}
              type="button"
              data-testid="wrapped-next"
              onClick={next}
              aria-disabled={index === count - 1}
              aria-label="Next slide"
              aria-controls={stageId}
              className={cn(chromeButton, "size-11")}
            >
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      {shareOpen && report && createPortal(<WrappedShareModal report={report} onClose={closeShare} />, document.body)}
    </div>
  );
}
