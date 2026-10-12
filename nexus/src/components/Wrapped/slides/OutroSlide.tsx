import { motion } from "motion/react";
import { RotateCcw, Share2 } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";
import { Backdrop, CoverArt, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { useGameArt } from "../useGameArt";
import { formatNumber, hoursOf, listJoin, periodPhrase, plural } from "../format";

const TILES = 18;

/** One-line summary of the whole period. */
export function outroSummary(report: WrappedReport): string {
  const h = hoursOf(report.totalPlayTimeS);
  const parts = [
    `${formatNumber(h.value, h.decimals)} ${plural(Number(h.value.toFixed(h.decimals)), "hour")}`,
    `${report.totalGamesPlayed} ${plural(report.totalGamesPlayed, "game")}`,
  ];
  if (report.longestStreakDays > 1) parts.push(`a ${report.longestStreakDays}-day streak`);
  return `${listJoin(parts)}. Your ${periodPhrase(report.periodLabel)}, well played.`;
}

/** A slowly drifting wall of your top covers behind the summary, with Share and Watch again. */
export function OutroSlide({
  report,
  onShare,
  onReplay,
}: {
  report: WrappedReport;
  onShare: () => void;
  onReplay: () => void;
}) {
  const m = useStoryMotion();
  const { art } = useGameArt();
  const games = report.topGames.slice(0, 9);
  const tiles = games.length > 0 ? Array.from({ length: TILES }, (_, i) => games[i % games.length]) : [];

  return (
    <>
      <Backdrop slide="outro" />
      {tiles.length > 0 && (
        <div aria-hidden="true" data-testid="wrapped-outro-collage" className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.div
            className="absolute -inset-x-[10%] -inset-y-[20%] grid rotate-[-8deg] grid-cols-6 content-center gap-4 opacity-55"
            {...m.drift(30)}
          >
            {tiles.map((g, i) => (
              <motion.div key={i} {...m.pop(Math.min(i, 12) * 0.5)}>
                <CoverArt name={g.name} src={art(g).cover} className="aspect-[3/4] w-full rounded-lg shadow-xl" />
              </motion.div>
            ))}
          </motion.div>
          <div className="absolute inset-0 bg-[radial-gradient(70%_65%_at_50%_50%,rgb(8_7_14/0.88)_20%,rgb(8_7_14/0.55)_100%)]" />
        </div>
      )}

      <SlideBody align="center">
        <motion.p {...m.rise(2)} className={eyebrowClass}>
          {report.periodLabel} · Nexus Wrapped
        </motion.p>
        <motion.h2
          {...m.rise(3)}
          className="mt-4 text-[clamp(3rem,8vw,6.5rem)] font-extrabold leading-[0.95] tracking-[-0.045em] text-white"
        >
          That&apos;s a wrap
        </motion.h2>
        <motion.p {...m.rise(4)} data-testid="wrapped-outro-summary" className="mt-5 max-w-xl text-pretty text-xl text-white/85">
          {outroSummary(report)}
        </motion.p>
        <motion.div {...m.rise(5)} className="mt-10 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            data-testid="wrapped-outro-share"
            onClick={onShare}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[rgb(12_10_20)] transition-colors duration-150 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(12_10_20)]"
          >
            <Share2 className="size-4" aria-hidden="true" />
            Share
          </button>
          <button
            type="button"
            data-testid="wrapped-outro-replay"
            onClick={onReplay}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-white/12 px-6 text-sm font-semibold text-white transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Watch again
          </button>
        </motion.div>
      </SlideBody>
    </>
  );
}
