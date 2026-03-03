import * as React from "react";
import { cn } from "@/lib/utils";
import {
  useOnboardingStore,
  STEP_ORDER,
  STEP_LABELS,
  getStepStatus,
  type StepStatus,
} from "@/stores/onboardingStore";
import { Check, Minus } from "lucide-react";

export function StepIndicator() {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const completedSteps = useOnboardingStore((s) => s.completedSteps);
  const skippedSteps = useOnboardingStore((s) => s.skippedSteps);
  const goToStep = useOnboardingStore((s) => s.goToStep);

  return (
    <div data-testid="step-indicator" className="flex items-center gap-3">
      {STEP_ORDER.map((step, i) => {
        const status = getStepStatus(step, currentStep, completedSteps, skippedSteps);
        const canNavigate = STEP_ORDER.indexOf(step) < STEP_ORDER.indexOf(currentStep);

        return (
          <React.Fragment key={step}>
            {i > 0 && (
              <div
                className={cn(
                  "h-px w-6",
                  status === "pending" ? "bg-border" : "bg-primary/40",
                )}
              />
            )}
            <button
              data-testid={`step-dot-${step}`}
              data-status={status}
              className={cn(
                "flex flex-col items-center gap-1",
                canNavigate ? "cursor-pointer" : "cursor-default",
              )}
              onClick={() => canNavigate && goToStep(step)}
              disabled={!canNavigate}
              aria-label={`${STEP_LABELS[step]} — ${status}`}
            >
              <StepDot status={status} />
              <span
                className={cn(
                  "text-[10px] font-medium",
                  status === "current"
                    ? "text-primary"
                    : "text-muted-foreground",
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepDot({ status }: { status: StepStatus }) {
  const base = "flex size-6 items-center justify-center rounded-full transition-all";

  switch (status) {
    case "current":
      return (
        <div className={cn(base, "bg-primary text-primary-foreground animate-pulse")} data-testid="step-dot-current">
          <div className="size-2 rounded-full bg-primary-foreground" />
        </div>
      );
    case "completed":
      return (
        <div className={cn(base, "bg-primary text-primary-foreground")}>
          <Check className="size-3.5" />
        </div>
      );
    case "skipped":
      return (
        <div className={cn(base, "bg-secondary text-muted-foreground")}>
          <Minus className="size-3.5" />
        </div>
      );
    default:
      return (
        <div className={cn(base, "border border-border bg-transparent text-muted-foreground")}>
          <div className="size-1.5 rounded-full bg-muted-foreground/40" />
        </div>
      );
  }
}
