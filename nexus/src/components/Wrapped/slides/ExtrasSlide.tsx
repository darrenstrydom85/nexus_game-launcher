import * as React from "react";
import { motion } from "motion/react";
import { ArrowUpRight, Gem, Lightbulb, Smile, Sparkles } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";
import { Backdrop, SlideBody, eyebrowClass, headlineClass } from "../StoryPrimitives";
import { useStoryMotion } from "../storyMotion";
import { useGameArt } from "../useGameArt";

interface Extra {
  key: string;
  icon: React.ReactNode;
  label: string;
  text: string;
  sub?: string;
  open?: () => void;
}

const MAX_CARDS = 6;

/** Mood, hidden gem, fun facts and trivia as cards that pop in one by one. */
export function ExtrasSlide({ report }: { report: WrappedReport }) {
  const m = useStoryMotion();
  const { art, openGame } = useGameArt();
  const icon = "size-5 text-white/85";

  const extras: Extra[] = [];
  if (report.moodTagline) {
    extras.push({ key: "mood", icon: <Smile className={icon} aria-hidden="true" />, label: "Your gaming mood", text: report.moodTagline });
  }
  if (report.hiddenGem) {
    const gem = report.hiddenGem;
    const inLibrary = art({ id: gem.gameId, name: gem.name }).inLibrary;
    extras.push({
      key: "gem",
      icon: <Gem className={icon} aria-hidden="true" />,
      label: "Hidden gem",
      text: gem.name,
      sub: gem.tagline,
      open: inLibrary ? () => openGame(gem.gameId, gem.name) : undefined,
    });
  }
  report.funFacts.forEach((f, i) =>
    extras.push({ key: `fact-${i}`, icon: <Sparkles className={icon} aria-hidden="true" />, label: "Fun fact", text: f.label }),
  );
  report.trivia.forEach((t, i) =>
    extras.push({ key: `trivia-${i}`, icon: <Lightbulb className={icon} aria-hidden="true" />, label: "Did you know?", text: t }),
  );
  const shown = extras.slice(0, MAX_CARDS);

  return (
    <>
      <Backdrop slide="extras" />
      <SlideBody>
        <motion.p {...m.rise(0)} className={eyebrowClass}>
          Fun extras
        </motion.p>
        <motion.h2 {...m.rise(1)} className={`mt-3 ${headlineClass}`}>
          A few more things
        </motion.h2>
        <ul className="mt-8 grid max-w-5xl gap-3 sm:grid-cols-2" data-testid="wrapped-extras">
          {shown.map((x, i) => (
            <motion.li
              key={x.key}
              {...m.pop(i * 1.25 + 2)}
              className={`flex items-start gap-4 rounded-2xl bg-white/[0.08] p-5 ${i === 0 && shown.length % 2 === 1 ? "sm:col-span-2" : ""}`}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white/10">{x.icon}</span>
              <div className="min-w-0">
                <p className="text-sm text-white/80">{x.label}</p>
                <p className={`mt-0.5 font-semibold text-white ${i === 0 ? "text-2xl" : "text-lg"}`}>{x.text}</p>
                {x.sub && <p className="mt-1 text-sm text-white/85">{x.sub}</p>}
                {x.open && (
                  <button
                    type="button"
                    onClick={x.open}
                    className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-full bg-white/12 px-3 text-sm font-medium text-white transition-colors duration-150 hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    View {x.text}
                    <ArrowUpRight className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </motion.li>
          ))}
        </ul>
      </SlideBody>
    </>
  );
}
