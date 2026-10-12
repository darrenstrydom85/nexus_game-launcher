import { motion } from "motion/react";
import { ArrowRight, ImageIcon, Layers, Trophy, type LucideIcon } from "lucide-react";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { EASE_OUT } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import nexusOnboardingLogo from "@/assets/nexus-onboarding-logo.png";

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Layers,
    title: "Every launcher",
    body: "Steam, Epic, GOG, Ubisoft Connect, Battle.net, Xbox and your own folders.",
  },
  {
    icon: ImageIcon,
    title: "A library that looks the part",
    body: "Artwork, ratings and how long each game takes to beat.",
  },
  {
    icon: Trophy,
    title: "Play and keep score",
    body: "Sessions, streaks, achievements and your yearly Wrapped.",
  },
];

/** Soft, static accent glow behind the logo tile. */
const LOGO_GLOW =
  "0 0 0 1px color-mix(in oklab, var(--primary) 40%, transparent), 0 12px 48px -6px color-mix(in oklab, var(--primary) 55%, transparent)";

export function WelcomeStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const reduceMotion = useReducedMotion();

  return (
    <div data-testid="welcome-step" className="flex flex-col items-center text-center">
      <span
        data-testid="welcome-logo"
        className="flex size-16 items-center justify-center rounded-2xl bg-primary"
        style={{ boxShadow: LOGO_GLOW }}
      >
        <img src={nexusOnboardingLogo} alt="" width={40} height={40} className="size-10" />
      </span>

      <h1
        tabIndex={-1}
        className="mt-7 text-[32px] font-semibold leading-tight tracking-[-0.02em] text-foreground outline-none"
      >
        Welcome to Nexus
      </h1>
      <p data-testid="welcome-tagline" className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
        All your games, from every launcher, in one place.
      </p>

      <ul
        data-testid="welcome-features"
        aria-label="What Nexus does"
        className="mt-9 w-full max-w-[460px] divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-card text-left"
      >
        {FEATURES.map(({ icon: Icon, title, body }, i) => (
          <motion.li
            key={title}
            data-testid={`welcome-feature-${i}`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_OUT, delay: 0.1 + i * 0.08 }}
            className="flex items-center gap-3.5 px-[18px] py-3.5"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="size-[18px]" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{title}</span>
              <span className="mt-0.5 block text-[13px] text-muted-foreground">{body}</span>
            </span>
          </motion.li>
        ))}
      </ul>

      <Button
        data-testid="welcome-start"
        onClick={goNext}
        className="mt-9 h-11 rounded-xl px-6 text-[15px] font-semibold has-[>svg]:px-6 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Let’s get started
        <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
      </Button>
    </div>
  );
}
