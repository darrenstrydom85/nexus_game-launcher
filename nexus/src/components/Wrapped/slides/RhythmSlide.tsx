import { motion } from "motion/react";
import { formatPlayTime } from "@/lib/utils";
import type { WrappedReport } from "@/types/wrapped";
import { ACCENT_FILL, Backdrop, GrowBar, SlideBody, eyebrowClass, headlineClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { DAY_NAMES, formatNumber, hourLabel, partOfDay, peakDay } from "../format";

const BAR_H = 176;

/** Day-of-week bars rising from the baseline with the peak day called out; time of day when known. */
export function RhythmSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const peak = peakDay(report.playTimeByDayOfWeek);
  if (!peak) return null;

  const byDay = new Map(report.playTimeByDayOfWeek.map((b) => [b.day % 7, b.playTimeS]));
  const days = DAY_NAMES.map((name, day) => ({ name, day, seconds: byDay.get(day) ?? 0 }));
  const max = peak.seconds || 1;
  const peakShare = (peak.seconds / peak.total) * 100;

  const tod = partOfDay(report.playTimeByHourOfDay);
  const hourMax = Math.max(1, ...report.playTimeByHourOfDay.map((b) => b.playTimeS));
  const byHour = new Map(report.playTimeByHourOfDay.map((b) => [b.hour, b.playTimeS]));

  return (
    <>
      <Backdrop slide="rhythm" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          When you play
        </motion.p>
        <motion.h2 {...m.rise(1)} data-testid="wrapped-peak-day" className={`mt-3 ${headlineClass}`}>
          {peak.name}s were yours
        </motion.h2>
        <motion.p {...m.rise(2)} className="mt-3 text-lg text-white/85">
          {formatPlayTime(peak.seconds)} on {peak.name}s, {formatNumber(peakShare)}% of your week.
        </motion.p>

        <div className="mt-10 flex max-w-3xl flex-col gap-10 lg:flex-row lg:items-end">
          <div className="flex-1">
            <div aria-hidden="true" className="flex items-end gap-3 border-b border-white/20" style={{ height: BAR_H }}>
              {days.map((d, i) => {
                const isPeak = d.day === peak.day;
                return (
                  <div key={d.name} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                    <div className="w-full overflow-hidden rounded-t-md" style={{ height: `${Math.max(2, (d.seconds / max) * 100)}%` }}>
                      <GrowBar axis="y" to={d.seconds > 0 ? 1 : 0} index={i + 2} color={isPeak ? "white" : ACCENT_FILL} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div aria-hidden="true" className="mt-2 flex gap-3">
              {days.map((d) => (
                <span
                  key={d.name}
                  className={`min-w-0 flex-1 text-center text-xs ${d.day === peak.day ? "font-semibold text-white" : "text-white/80"}`}
                >
                  {d.name.slice(0, 3)}
                </span>
              ))}
            </div>
            <ul className="sr-only">
              {days.map((d) => (
                <li key={d.name}>
                  {d.name}: {formatPlayTime(d.seconds)}
                </li>
              ))}
            </ul>
          </div>

          {tod && (
            <motion.div {...m.rise(10)} data-testid="wrapped-time-of-day" className="lg:w-64">
              <p className="text-sm text-white/80">Time of day</p>
              <p className="mt-1 text-2xl font-bold text-white">
                Mostly a{tod.part === "afternoon" || tod.part === "evening" ? "n" : ""} {tod.part} player
              </p>
              <p className="mt-1 text-sm text-white/85">Peak hour: {hourLabel(tod.peakHour)}</p>
              <div aria-hidden="true" className="mt-4 flex h-12 items-end gap-px">
                {Array.from({ length: 24 }, (_, h) => {
                  const s = byHour.get(h) ?? 0;
                  return (
                    <div key={h} className="flex h-full flex-1 flex-col justify-end">
                      <div className="w-full overflow-hidden rounded-t-[2px]" style={{ height: `${Math.max(4, (s / hourMax) * 100)}%` }}>
                        <GrowBar
                          axis="y"
                          to={1}
                          index={10 + h * 0.25}
                          color={h === tod.peakHour ? "white" : s > 0 ? ACCENT_FILL : "rgb(255 255 255 / 0.15)"}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div aria-hidden="true" className="mt-1 flex justify-between text-[11px] text-white/80">
                <span>12a</span>
                <span>6a</span>
                <span>12p</span>
                <span>6p</span>
                <span>12a</span>
              </div>
            </motion.div>
          )}
        </div>
      </SlideBody>
    </>
  );
}
