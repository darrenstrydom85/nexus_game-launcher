import * as React from "react";
import { motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  useOnboardingStore,
  STEP_ORDER,
  SKIPPABLE_STEPS,
  type OnboardingStep,
} from "@/stores/onboardingStore";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Titlebar } from "@/components/shared/Titlebar";
import nexusOnboardingLogo from "@/assets/nexus-onboarding-logo.png";
import { StepIndicator } from "./StepIndicator";
import { FooterSlotContext, FOOTER_BUTTON, FOOTER_PRIMARY } from "./StepFooter";

interface OnboardingWizardProps {
  children: Record<OnboardingStep, React.ReactNode>;
}

/** Heading copy for every step except Welcome, which brings its own hero. */
const STEP_COPY: Record<Exclude<OnboardingStep, "welcome">, { title: string; description: string }> = {
  steamgriddb: {
    title: "Artwork for your games",
    description: "A free SteamGridDB key lets Nexus fetch covers, hero banners and logos for every game in your library.",
  },
  igdb: {
    title: "Game details",
    description: "A free Twitch developer key lets Nexus pull descriptions, ratings, genres and release dates from IGDB.",
  },
  sources: {
    title: "Where your games live",
    description: "Choose the launchers to include and add any folders that hold other games. Nexus scans them all in one go.",
  },
  confirm: {
    title: "Your library",
    description: "Everything is selected. Untick anything you don’t want; it’s kept hidden, so you can bring it back later in Settings.",
  },
};

/** Static accent glow in the rail's top corner. */
const RAIL_GLOW =
  "radial-gradient(ellipse 90% 40% at 0% 0%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 70%)";

export function OnboardingWizard({ children }: OnboardingWizardProps) {
  const isCompleted = useOnboardingStore((s) => s.isCompleted);
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const goNext = useOnboardingStore((s) => s.goNext);
  const goBack = useOnboardingStore((s) => s.goBack);
  const skipCurrent = useOnboardingStore((s) => s.skipCurrent);
  const reduceMotion = useReducedMotion();

  // Steps render their own primary action into the footer; until one claims
  // the slot the wizard shows a plain Continue.
  const [footerTarget, setFooterTarget] = React.useState<HTMLDivElement | null>(null);
  const [claims, setClaims] = React.useState(0);
  const claim = React.useCallback(() => {
    setClaims((c) => c + 1);
    return () => setClaims((c) => c - 1);
  }, []);
  const slot = React.useMemo(() => ({ target: footerTarget, claim }), [footerTarget, claim]);

  // On step change, move focus to the new heading so keyboard and screen
  // reader users start at the top instead of on a button that just unmounted.
  const contentRef = React.useRef<HTMLDivElement>(null);
  const prevStep = React.useRef(currentStep);
  React.useEffect(() => {
    if (prevStep.current === currentStep) return;
    prevStep.current = currentStep;
    contentRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [currentStep]);

  if (isCompleted) return null;

  const stepIdx = STEP_ORDER.indexOf(currentStep);
  const isWelcome = currentStep === "welcome";
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === STEP_ORDER.length - 1;
  const canSkip = SKIPPABLE_STEPS.includes(currentStep);
  const copy = currentStep === "welcome" ? null : STEP_COPY[currentStep];

  return (
    <div data-testid="onboarding-wizard" className="fixed inset-0 z-[70] flex flex-col bg-background">
      <Titlebar />

      <div className="flex min-h-0 flex-1">
        {/* Left rail: brand, steps, reassurance */}
        <aside
          data-testid="onboarding-rail"
          className="relative flex w-[340px] shrink-0 flex-col overflow-hidden border-r border-border bg-card max-[960px]:w-[280px]"
        >
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: RAIL_GLOW }} />
          <div className="relative flex items-center gap-3 px-7 pt-8">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
              <img src={nexusOnboardingLogo} alt="" width={24} height={24} className="size-6" />
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.01em] text-foreground">Nexus</span>
          </div>
          <div className="relative min-h-0 flex-1 overflow-y-auto px-5 py-10">
            <StepIndicator />
          </div>
          <p className="relative px-7 pb-7 text-[13px] text-muted-foreground">
            You can change any of this later in Settings.
          </p>
        </aside>

        {/* Right pane: scrolling step content over a pinned footer */}
        <main className="flex min-w-0 flex-1 flex-col">
          <FooterSlotContext.Provider value={slot}>
            {/* Keyed so each step starts at the top and enters fresh (no exit animation). */}
            <div key={currentStep} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <motion.div
                ref={contentRef}
                data-testid="onboarding-step-content"
                initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
                className={cn("mx-auto w-full max-w-[640px] px-10 py-12", isWelcome && "my-auto")}
              >
                {copy && (
                  <header className="mb-8">
                    <p data-testid="onboarding-eyebrow" className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                      Step {stepIdx + 1} of {STEP_ORDER.length}
                    </p>
                    <h1
                      tabIndex={-1}
                      className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-foreground outline-none"
                    >
                      {copy.title}
                    </h1>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{copy.description}</p>
                  </header>
                )}
                {children[currentStep]}
              </motion.div>
            </div>

            {/* Welcome has its own call to action, so no footer there. */}
            {!isWelcome && (
              <footer data-testid="onboarding-footer" className="shrink-0 border-t border-border py-4">
                <div className="mx-auto flex w-full max-w-[640px] flex-wrap items-center gap-x-3 gap-y-2 px-10">
                  {!isFirst && (
                    <Button data-testid="onboarding-back" variant="ghost" className={FOOTER_BUTTON} onClick={goBack}>
                      <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
                      Back
                    </Button>
                  )}
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
                    {canSkip && (
                      <Button data-testid="onboarding-skip" variant="ghost" className={FOOTER_BUTTON} onClick={skipCurrent}>
                        Skip for now
                      </Button>
                    )}
                    <div ref={setFooterTarget} className="contents" />
                    {claims === 0 && !isLast && (
                      <Button data-testid="onboarding-next" className={FOOTER_PRIMARY} onClick={goNext}>
                        Continue
                        <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              </footer>
            )}
          </FooterSlotContext.Provider>
        </main>
      </div>
    </div>
  );
}
