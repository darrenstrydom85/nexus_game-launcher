import { motion } from "motion/react";
import { HardDriveDownload } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { WrappedReport } from "@/types/wrapped";
import { ACCENT_FILL, Backdrop, CoverArt, GrowBar, SlideBody, eyebrowClass, headlineClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { useGameArt } from "../useGameArt";
import { formatNumber, percentDecimals } from "../format";

/** Ranked top five: covers slide in one after another, bars grow to each game's share. */
export function TopGamesSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const { art } = useGameArt();
  const games = report.topGames.slice(0, 5);
  const top = games[0]?.playTimeS || 1;

  return (
    <>
      <Backdrop slide="top-games" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          On repeat
        </motion.p>
        <motion.h2 {...m.rise(1)} className={`mt-3 ${headlineClass}`}>
          Your top {games.length}
        </motion.h2>

        <ol className="mt-8 flex max-w-3xl flex-col gap-3" data-testid="wrapped-top-games">
          {games.map((g, i) => {
            const share = report.totalPlayTimeS > 0 ? (g.playTimeS / report.totalPlayTimeS) * 100 : 0;
            const { cover, isRemoved } = art(g);
            return (
              <motion.li
                key={g.id}
                {...m.slideIn(i + 2)}
                data-testid={`wrapped-top-game-row-${i}`}
                className="flex items-center gap-4"
              >
                <span
                  aria-hidden="true"
                  className={`w-8 shrink-0 text-right text-3xl font-extrabold tabular-nums ${i === 0 ? "text-white" : "text-white/70"}`}
                >
                  {i + 1}
                </span>
                <span className="relative">
                  <CoverArt name={g.name} src={cover} className="h-16 w-12" />
                  {isRemoved && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-md bg-black/60" title="Uninstalled">
                      <HardDriveDownload className="size-3.5 text-white/85" aria-label="Uninstalled" />
                    </span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-lg font-semibold text-white">
                      <span className="sr-only">{i + 1}. </span>
                      {g.name}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-white/85">
                      {formatPlayTime(g.playTimeS)} · {formatNumber(share, percentDecimals(share))}%
                    </span>
                  </div>
                  <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/12">
                    <GrowBar axis="x" to={g.playTimeS / top} index={i + 2} color={i === 0 ? "white" : ACCENT_FILL} className="rounded-full" />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </SlideBody>
    </>
  );
}
