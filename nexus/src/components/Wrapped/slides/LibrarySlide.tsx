import { motion } from "motion/react";
import type { WrappedReport } from "@/types/wrapped";
import { CountUp } from "../CountUp";
import { ACCENT_FILL, Backdrop, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { formatNumber, plural } from "../format";

const CELLS = 120;

/** Games added this period: a count-up, and the library as a grid where the new arrivals pop in. */
export function LibrarySlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const added = report.newGamesAdded;
  const total = Math.max(report.totalGamesInLibrary, added);
  const share = total > 0 ? (added / total) * 100 : 0;
  // One cell per game up to CELLS, scaled beyond that; new games always get at least one lit cell.
  const cells = Math.min(total, CELLS);
  const lit = Math.max(1, Math.min(cells, Math.round((added / Math.max(total, 1)) * cells)));

  return (
    <>
      <Backdrop slide="library" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          Library growth
        </motion.p>
        <div className="mt-4 grid max-w-5xl items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <motion.p {...m.rise(1)} data-testid="wrapped-games-added" className="flex items-baseline text-white">
              <span className="text-[clamp(4rem,11vw,8rem)] font-extrabold leading-none tracking-[-0.05em]">+</span>
              <CountUp value={added} delay={0.3} className="text-[clamp(4rem,11vw,8rem)] font-extrabold leading-none tracking-[-0.05em]" />
            </motion.p>
            <motion.h2 {...m.rise(2)} className="mt-3 text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold leading-tight tracking-[-0.03em] text-white">
              {plural(added, "game")} joined your library
            </motion.h2>
            <motion.p {...m.rise(3)} className="mt-3 text-lg text-white/85">
              It now holds {formatNumber(total)} {plural(total, "game")}, {formatNumber(share, share < 10 ? 1 : 0)}% of them new.
            </motion.p>
          </div>

          <div aria-hidden="true" className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1.5 sm:gap-2">
            {Array.from({ length: cells }, (_, i) => {
              const isNew = i >= cells - lit;
              return isNew ? (
                <motion.span
                  key={i}
                  {...m.pop(4 + Math.min(i - (cells - lit), 14) * 0.6)}
                  className="aspect-[3/4] rounded-[3px]"
                  style={{ background: ACCENT_FILL }}
                />
              ) : (
                <span key={i} className="aspect-[3/4] rounded-[3px] bg-white/12" />
              );
            })}
          </div>
        </div>
      </SlideBody>
    </>
  );
}
