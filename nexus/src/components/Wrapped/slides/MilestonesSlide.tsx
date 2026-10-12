import { motion } from "motion/react";
import { CalendarDays, Flame, Timer } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { WrappedReport } from "@/types/wrapped";
import { CountUp } from "../CountUp";
import { Backdrop, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { hoursOf, plural, shortDate } from "../format";

const FLAME = "oklch(0.8 0.16 60)";

/** Longest streak with a flame and a count-up; the longest session and busiest day beside it. */
export function MilestonesSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const streak = report.longestStreakDays;
  const session = report.longestSession;
  const sessionHours = session ? hoursOf(session.durationS) : null;
  const first = report.firstGamePlayed;
  const last = report.lastGamePlayed;

  return (
    <>
      <Backdrop slide="milestones" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          Milestones
        </motion.p>

        <div className="mt-6 grid max-w-5xl items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
          {streak > 0 ? (
            <div data-testid="wrapped-streak" className="flex items-center gap-6">
              <motion.span
                {...m.pop(1)}
                aria-hidden="true"
                className="flex size-24 shrink-0 items-center justify-center rounded-full sm:size-28"
                style={{ background: "radial-gradient(circle at 50% 60%, oklch(0.62 0.2 45 / 0.55), transparent 70%)" }}
              >
                <Flame className="size-14 sm:size-16" style={{ color: FLAME }} strokeWidth={1.75} />
              </motion.span>
              <motion.div {...m.rise(2)}>
                <p className="flex items-baseline gap-3 text-white">
                  <CountUp
                    value={streak}
                    delay={0.35}
                    className="text-[clamp(4rem,10vw,7.5rem)] font-extrabold leading-none tracking-[-0.05em]"
                  />
                  <span className="text-2xl font-bold">{plural(streak, "day")}</span>
                </p>
                <p className="mt-2 text-lg text-white/85">Your longest run of back-to-back play days.</p>
              </motion.div>
            </div>
          ) : (
            session &&
            sessionHours && (
              <motion.div {...m.rise(1)}>
                <p className="text-sm text-white/80">Your longest session</p>
                <p className="mt-1 flex items-baseline gap-2 text-white">
                  <CountUp
                    value={sessionHours.value}
                    decimals={sessionHours.decimals}
                    delay={0.35}
                    className="text-[clamp(4rem,10vw,7.5rem)] font-extrabold leading-none tracking-[-0.05em]"
                  />
                  <span className="text-2xl font-bold">hours</span>
                </p>
                <p className="mt-2 text-lg text-white/85">
                  on {session.gameName}, {shortDate(session.startedAt)}.
                </p>
              </motion.div>
            )
          )}

          <div className="flex flex-col gap-3">
            {streak > 0 && session && (
              <motion.div {...m.pop(3)} data-testid="wrapped-longest-session" className="flex items-start gap-4 rounded-2xl bg-white/[0.08] p-5">
                <Timer className="mt-0.5 size-5 shrink-0 text-white/85" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Longest session</p>
                  <p className="mt-0.5 text-xl font-bold text-white">
                    {formatPlayTime(session.durationS)} <span className="font-medium text-white/85">on</span> {session.gameName}
                  </p>
                  <p className="text-sm text-white/80">{shortDate(session.startedAt)}</p>
                </div>
              </motion.div>
            )}
            {report.busiestDay && (
              <motion.div {...m.pop(4)} className="flex items-start gap-4 rounded-2xl bg-white/[0.08] p-5">
                <CalendarDays className="mt-0.5 size-5 shrink-0 text-white/85" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm text-white/80">Busiest day</p>
                  <p className="mt-0.5 text-xl font-bold text-white">{shortDate(report.busiestDay)}</p>
                  <p className="text-sm text-white/80">{formatPlayTime(report.busiestDayPlayTimeS)} played</p>
                </div>
              </motion.div>
            )}
            {first && last && first.id !== last.id && (
              <motion.p {...m.rise(5)} className="px-1 text-base text-white/85">
                Opened with <span className="font-semibold text-white">{first.name}</span>, closed with{" "}
                <span className="font-semibold text-white">{last.name}</span>.
              </motion.p>
            )}
          </div>
        </div>
      </SlideBody>
    </>
  );
}
