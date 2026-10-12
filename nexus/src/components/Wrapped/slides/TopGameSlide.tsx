import { motion } from "motion/react";
import { ArrowUpRight, Crown, HardDriveDownload } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";
import { CountUp } from "../CountUp";
import { ACCENT_INK, Backdrop, CoverArt, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { useGameArt } from "../useGameArt";
import { hoursOf, percentDecimals, plural } from "../format";

/** The most played game, full bleed: its art drifts slowly behind the name and the numbers. */
export function TopGameSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const { art, openGame } = useGameArt();
  const game = report.mostPlayedGame;
  if (!game) return null;

  const { hero, cover, inLibrary, isRemoved } = art(game);
  const hours = hoursOf(game.playTimeS);
  const share = report.totalPlayTimeS > 0 ? (game.playTimeS / report.totalPlayTimeS) * 100 : 0;

  return (
    <>
      <Backdrop slide="top-game" dim={Boolean(hero || cover)} />
      {(hero || cover) && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.img
            data-testid="wrapped-top-game-art"
            data-art={hero ? "hero" : "cover"}
            src={hero ?? cover ?? undefined}
            alt=""
            draggable={false}
            {...m.kenBurns()}
            // A portrait cover stretched full-bleed is soft anyway: blur it (statically) into a wash.
            className={hero ? "size-full object-cover" : "size-full scale-110 object-cover blur-[18px]"}
          />
          {/* Scrims: deep at the bottom-left where the text sits. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(8_7_14)] via-[rgb(8_7_14/0.6)] to-[rgb(8_7_14/0.15)]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[rgb(8_7_14/0.75)] to-transparent" />
        </div>
      )}

      {/* mb-0 drops the body to the bottom edge, under the art. */}
      <SlideBody className="mb-0">
        <div className="flex items-end gap-8">
          {cover && !hero && (
            <motion.div {...m.pop(1)} className="hidden sm:block">
              <CoverArt name={game.name} src={cover} className="h-64 w-44 rounded-lg shadow-2xl" />
            </motion.div>
          )}
          <div className="min-w-0 flex-1">
            <motion.p {...m.rise(0)} className={`${eyebrowClass} inline-flex items-center gap-2`}>
              <Crown className="size-4" style={{ color: ACCENT_INK }} aria-hidden="true" />
              Your #1
            </motion.p>
            <motion.h2
              {...m.rise(1)}
              data-testid="wrapped-top-game-name"
              className="mt-3 text-balance text-[clamp(2.75rem,7.5vw,6.5rem)] font-extrabold leading-[0.95] tracking-[-0.04em] text-white [overflow-wrap:anywhere]"
            >
              {game.name}
            </motion.h2>
            {isRemoved && (
              <motion.span
                {...m.rise(2)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85"
              >
                <HardDriveDownload className="size-3.5" aria-hidden="true" />
                Uninstalled
              </motion.span>
            )}

            <motion.dl {...m.rise(3)} className="mt-8 flex flex-wrap gap-x-10 gap-y-4 text-white">
              <div>
                <dt className="text-sm text-white/80">Hours played</dt>
                <dd className="text-[clamp(2rem,4vw,3rem)] font-bold leading-tight">
                  <CountUp value={hours.value} decimals={hours.decimals} delay={0.45} />
                </dd>
              </div>
              <div>
                <dt className="text-sm text-white/80">Of all your play</dt>
                <dd className="text-[clamp(2rem,4vw,3rem)] font-bold leading-tight">
                  <CountUp value={share} decimals={percentDecimals(share)} delay={0.55} />%
                </dd>
              </div>
              <div>
                <dt className="text-sm text-white/80">{plural(game.sessionCount, "Session")}</dt>
                <dd className="text-[clamp(2rem,4vw,3rem)] font-bold leading-tight">
                  <CountUp value={game.sessionCount} delay={0.65} />
                </dd>
              </div>
            </motion.dl>

            {inLibrary && (
              <motion.div {...m.rise(4)} className="mt-8">
                <button
                  type="button"
                  onClick={() => openGame(game.id, game.name)}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-white/12 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  View game
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </button>
              </motion.div>
            )}
          </div>
        </div>
      </SlideBody>
    </>
  );
}
