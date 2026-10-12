import { motion } from "motion/react";
import type { WrappedReport } from "@/types/wrapped";
import { ACCENT_FILL, Backdrop, GrowBar, SlideBody, eyebrowClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { formatNumber, percentDecimals } from "../format";

const GENRE_COLORS = [
  ACCENT_FILL,
  "oklch(0.78 0.13 200)",
  "oklch(0.8 0.14 150)",
  "oklch(0.83 0.13 85)",
  "oklch(0.74 0.16 30)",
  "oklch(0.75 0.14 330)",
];

/** The top genre as a headline, then a strip that fills left to right with every genre's share. */
export function GenresSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const genres = report.genreBreakdown.slice(0, 6);
  if (genres.length === 0) return null;
  const top = report.mostPlayedGenre ?? genres[0].name;
  // Games can carry several genres, so shares may add past 100: lay the strip out by proportion.
  const sum = genres.reduce((s, g) => s + g.percent, 0) || 1;
  let offset = 0;

  return (
    <>
      <Backdrop slide="genres" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          Your genres
        </motion.p>
        <motion.h2
          {...m.rise(1)}
          data-testid="wrapped-genre-headline"
          className="mt-3 max-w-[16ch] text-balance text-[clamp(2.5rem,6.5vw,5.5rem)] font-extrabold leading-[0.98] tracking-[-0.04em] text-white"
        >
          You were all about <span style={{ color: GENRE_COLORS[0] }}>{top}</span>
        </motion.h2>
        {report.genreTagline && (
          <motion.p {...m.rise(2)} data-testid="wrapped-genre-tagline" className="mt-4 max-w-xl text-lg text-white/85">
            {report.genreTagline}
          </motion.p>
        )}

        <div aria-hidden="true" className="relative mt-10 h-4 w-full max-w-3xl overflow-hidden rounded-full bg-white/10">
          {genres.map((g, i) => {
            const left = offset;
            const width = (g.percent / sum) * 100;
            offset += width;
            return (
              <div key={g.name} className="absolute inset-y-0" style={{ left: `${left}%`, width: `${width}%` }}>
                <GrowBar
                  axis="x"
                  to={1}
                  index={i * 1.5}
                  color={GENRE_COLORS[i % GENRE_COLORS.length]}
                  className="border-r-2 border-[rgb(8_7_14/0.6)]"
                />
              </div>
            );
          })}
        </div>

        <ul className="mt-6 grid max-w-3xl grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {genres.map((g, i) => (
            <motion.li key={g.name} {...m.rise(i + 3)} className="flex min-w-0 items-center gap-2.5">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: GENRE_COLORS[i % GENRE_COLORS.length] }}
              />
              <span className="truncate text-base font-medium text-white">{g.name}</span>
              <span className="ml-auto shrink-0 text-sm tabular-nums text-white/85">
                {formatNumber(g.percent, percentDecimals(g.percent))}%
              </span>
            </motion.li>
          ))}
        </ul>
      </SlideBody>
    </>
  );
}
