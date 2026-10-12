import { motion } from "motion/react";
import { Tv } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { WatchAggregate } from "@/lib/tauri";
import { CountUp } from "../CountUp";
import { Backdrop, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { hoursOf, plural } from "../format";

const TWITCH_INK = "oklch(0.78 0.14 295)";

/** Hours of streams watched in the period, plus the channels and games you watched most. */
export function TwitchSlide({ watch, periodLabel }: { watch: WatchAggregate; periodLabel: string }) {
  const m = useStoryMotion();
  const hours = hoursOf(watch.totals.totalSecs);
  const channels = (watch.topChannels ?? []).slice(0, 3);
  const games = (watch.topGames ?? []).filter((g) => g.twitchGameName).slice(0, 3);

  return (
    <>
      <Backdrop slide="twitch" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={`${eyebrowClass} inline-flex items-center gap-2`}>
          <Tv className="size-4" style={{ color: TWITCH_INK }} aria-hidden="true" />
          Twitch · {periodLabel}
        </motion.p>
        <motion.p {...m.rise(1)} data-testid="wrapped-twitch-hours" className="mt-4 flex flex-wrap items-baseline gap-x-4 text-white">
          <CountUp
            value={hours.value}
            decimals={hours.decimals}
            delay={0.3}
            className="text-[clamp(4rem,11vw,8rem)] font-extrabold leading-none tracking-[-0.05em]"
          />
          <span className="text-2xl font-bold">{plural(Number(hours.value.toFixed(hours.decimals)), "hour")} of streams</span>
        </motion.p>
        <motion.p {...m.rise(2)} className="mt-3 text-lg text-white/85">
          Across {watch.totals.sessionCount} watch {plural(watch.totals.sessionCount, "session")}.
        </motion.p>

        <div className="mt-10 grid max-w-4xl gap-8 sm:grid-cols-2">
          {channels.length > 0 && (
            <TopList
              title="Channels you watched most"
              rows={channels.map((c) => ({ key: c.channelLogin, name: c.channelDisplayName ?? c.channelLogin, secs: c.totalSecs }))}
              start={3}
            />
          )}
          {games.length > 0 && (
            <TopList
              title="Games you watched most"
              rows={games.map((g, i) => ({ key: g.twitchGameId ?? `g${i}`, name: g.twitchGameName ?? "Unknown", secs: g.totalSecs }))}
              start={3 + channels.length}
            />
          )}
        </div>
      </SlideBody>
    </>
  );
}

function TopList({ title, rows, start }: { title: string; rows: { key: string; name: string; secs: number }[]; start: number }) {
  const m = useStoryMotion();
  return (
    <div>
      <motion.h3 {...m.rise(start)} className="text-sm font-medium text-white/80">
        {title}
      </motion.h3>
      <ol className="mt-3 flex flex-col gap-2">
        {rows.map((r, i) => (
          <motion.li key={r.key} {...m.slideIn(start + i + 1)} className="flex items-baseline gap-3 rounded-xl bg-white/[0.08] px-4 py-3">
            <span className="w-4 shrink-0 text-sm font-bold tabular-nums text-white/80">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-lg font-semibold text-white">{r.name}</span>
            <span className="shrink-0 text-sm tabular-nums text-white/85">{formatPlayTime(r.secs)}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
