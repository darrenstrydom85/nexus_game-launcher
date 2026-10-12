import { motion, useReducedMotionConfig } from "motion/react";
import { Flame, FolderPlus, Gamepad2, ImageIcon, RefreshCw } from "lucide-react";
import { EASE_OUT } from "@/lib/motion";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import nexusLogo from "@/assets/nexus-onboarding-logo.png";
import { SOURCE_STYLE } from "./Shelves";

const LAUNCHERS = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox"] as const;
const LAUNCHER_NAMES: Record<(typeof LAUNCHERS)[number], string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
  xbox: "Xbox",
};

const FEATURES = [
  { icon: Gamepad2, title: "Every launcher", body: "One library, whichever store you bought it from" },
  { icon: ImageIcon, title: "Looks the part", body: "Artwork, ratings and how long each game takes to beat" },
  { icon: Flame, title: "Keeps score", body: "Sessions, streaks, achievements and your Wrapped" },
];

// Seeds for the ghost covers: only their colours show, never the words.
const SEEDS = "Aurora Basalt Cinder Delta Ember Fjord Glacier Harbor Iris Juniper Krypton Lumen Mistral Nova Onyx Prism Quartz Rift Solace Tundra Umbra Vesper Willow Zephyr Atlas Borealis Comet Dune".split(" ");

/**
 * An empty library: nothing to spotlight yet, so make the first screen worth
 * landing on. A drifting wall of cover cards behind the pitch and two clear
 * ways in. The wall holds still when motion is reduced.
 */
export function HomeWelcome({ onResync, onAddFolder }: { onResync: () => void; onAddFolder: () => void }) {
  const calm = Boolean(useReducedMotionConfig());
  const enter = (i: number) =>
    calm
      ? {}
      : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: EASE_OUT, delay: 0.08 * i } };

  return (
    <section aria-label="Welcome" data-testid="home-welcome" className="relative isolate flex flex-1 items-center overflow-hidden">
      {/* Accent light, static. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 78% 30%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%), radial-gradient(ellipse 45% 55% at 5% 95%, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
        }}
      />
      <CoverWall calm={calm} />

      <div className="relative flex w-full max-w-[620px] flex-col gap-6 px-12 py-16 max-[900px]:px-8">
        <motion.span
          {...enter(0)}
          className="flex size-14 items-center justify-center rounded-2xl bg-primary shadow-[0_12px_40px_-8px_var(--primary)]"
        >
          <img src={nexusLogo} alt="" className="size-9" draggable={false} />
        </motion.span>
        <motion.div {...enter(1)} className="flex flex-col gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Welcome to Nexus</span>
          <h1 className="text-[clamp(40px,5.2vw,64px)] font-bold leading-[0.98] tracking-[-0.03em] text-foreground">
            Every game you own.
            <br />
            <span className="bg-[linear-gradient(100deg,var(--primary),color-mix(in_oklab,var(--primary)_45%,var(--foreground)))] bg-clip-text text-transparent">
              One launcher.
            </span>
          </h1>
        </motion.div>
        <motion.p {...enter(2)} className="max-w-[480px] text-[15px] leading-relaxed text-muted-foreground">
          Sync to pull in your stores, or point Nexus at the folders where your other games live. It takes a minute.
        </motion.p>
        <motion.ul {...enter(3)} aria-label="Supported launchers" className="flex flex-wrap gap-1.5">
          {LAUNCHERS.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-2.5 py-1 text-xs font-medium text-foreground/85"
            >
              <span aria-hidden className="size-1.5 rounded-full" style={{ background: SOURCE_STYLE[id].colour }} />
              {LAUNCHER_NAMES[id]}
            </li>
          ))}
        </motion.ul>
        <motion.div {...enter(4)} className="flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="welcome-sync"
            onClick={onResync}
            className="pressable flex h-12 items-center gap-2.5 rounded-xl bg-primary pl-5 pr-6 text-base font-semibold text-primary-foreground shadow-[0_10px_30px_-10px_var(--primary)] outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RefreshCw className="size-[18px]" strokeWidth={2} />
            Sync library
          </button>
          <button
            type="button"
            data-testid="welcome-add-folder"
            onClick={onAddFolder}
            className="pressable flex h-12 items-center gap-2.5 rounded-xl border border-border bg-background/70 px-5 text-base font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FolderPlus className="size-[18px]" strokeWidth={2} />
            Add a folder
          </button>
        </motion.div>
        <motion.ul {...enter(5)} className="mt-4 grid gap-3 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex flex-col gap-2 rounded-2xl border border-border bg-card/80 p-4">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary/12 text-primary">
                <Icon className="size-[18px]" strokeWidth={2} />
              </span>
              <span className="text-sm font-semibold text-foreground">{title}</span>
              <span className="text-xs leading-relaxed text-muted-foreground">{body}</span>
            </li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}

/** Tilted columns of colour-only cover cards drifting past, fading into the copy. */
function CoverWall({ calm }: { calm: boolean }) {
  const columns = [0, 1, 2, 3].map((c) => SEEDS.slice(c * 7, c * 7 + 7));
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute -right-[4%] -top-[12%] -z-10 flex h-[124%] w-[58%] gap-4 opacity-80 max-[900px]:opacity-40"
      style={{
        transform: "perspective(1600px) rotateX(14deg) rotateY(-16deg) rotateZ(5deg)",
        maskImage: "linear-gradient(to right, transparent, black 30%)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 30%)",
      }}
    >
      {columns.map((seeds, c) => {
        const up = c % 2 === 0;
        return (
          <div key={c} className="relative flex-1 overflow-hidden">
            <motion.div
              className="flex flex-col gap-4"
              initial={false}
              animate={calm ? { y: up ? "0%" : "-50%" } : { y: up ? ["0%", "-50%"] : ["-50%", "0%"] }}
              transition={calm ? { duration: 0 } : { duration: 70 + c * 9, ease: "linear", repeat: Infinity }}
            >
              {/* Twice over, so the loop has no seam. */}
              {[...seeds, ...seeds].map((seed, i) => (
                <span
                  key={`${seed}-${i}`}
                  className="img-outline relative block aspect-[2/3] w-full shrink-0 overflow-hidden rounded-xl"
                  style={{ background: placeholderGradient(seed) }}
                >
                  <span className="absolute inset-x-3 bottom-3 flex flex-col gap-1.5">
                    <span className="h-2 w-3/4 rounded-full bg-white/35" />
                    <span className="h-2 w-1/2 rounded-full bg-white/20" />
                  </span>
                </span>
              ))}
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

/** Same shape as the loaded Home, so nothing jumps when the library arrives. */
export function HomeSkeleton() {
  return (
    <div data-testid="home-loading" aria-busy="true" aria-label="Loading your library" className="flex flex-col">
      <div className="relative h-[clamp(320px,50vh,500px)] bg-secondary/50">
        <div className="absolute bottom-9 left-10 flex flex-col gap-4">
          <div className="h-3 w-40 rounded-full bg-secondary motion-safe:animate-pulse" />
          <div className="h-12 w-[min(480px,60vw)] rounded-xl bg-secondary motion-safe:animate-pulse" />
          <div className="h-12 w-56 rounded-xl bg-secondary motion-safe:animate-pulse" />
        </div>
      </div>
      <div className="flex flex-wrap gap-4 px-10 pt-2">
        {["flex-[4_1_300px]", "flex-[5_1_340px]", "flex-[3_1_240px]"].map((f) => (
          <div key={f} className={`h-56 min-w-0 rounded-2xl bg-secondary/70 motion-safe:animate-pulse ${f}`} />
        ))}
      </div>
    </div>
  );
}
