import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useOnboardingStore,
  STEP_ORDER,
  STEP_LABELS,
  STEP_SUBLABELS,
  getStepStatus,
  type StepStatus,
} from "@/stores/onboardingStore";

const STATUS_TEXT: Partial<Record<StepStatus, string>> = {
  completed: "Done",
  skipped: "Skipped",
};

/**
 * Vertical list of setup steps for the left rail. Earlier steps are buttons
 * that jump back; the current and later steps are plain text. State changes
 * are instant: nothing here animates.
 */
export function StepIndicator() {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const completedSteps = useOnboardingStore((s) => s.completedSteps);
  const skippedSteps = useOnboardingStore((s) => s.skippedSteps);
  const goToStep = useOnboardingStore((s) => s.goToStep);
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <nav aria-label="Setup steps" data-testid="step-indicator">
      <ol className="flex flex-col gap-3">
        {STEP_ORDER.map((step, i) => {
          const status = getStepStatus(step, currentStep, completedSteps, skippedSteps);
          const isPast = i < currentIdx;
          const statusText = STATUS_TEXT[status];
          const row = "relative flex w-full items-start gap-3.5 rounded-xl p-2 text-left";
          const body = (
            <>
              <StepCircle status={status} number={i + 1} />
              <span className="min-w-0 pt-[3px]">
                <span
                  className={cn(
                    "block text-sm leading-5",
                    status === "current" ? "font-semibold text-foreground" : "font-medium",
                    status === "pending" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-[18px] text-muted-foreground">
                  {STEP_SUBLABELS[step]}
                </span>
                {statusText && <span className="sr-only">{`, ${statusText.toLowerCase()}`}</span>}
              </span>
            </>
          );

          return (
            <li key={step} className="relative">
              {isPast ? (
                <button
                  type="button"
                  data-testid={`step-dot-${step}`}
                  data-status={status}
                  onClick={() => goToStep(step)}
                  className={cn(
                    row,
                    "outline-none transition-colors duration-150 hover:bg-secondary/70 focus-visible:ring-2 focus-visible:ring-ring",
                  )}
                >
                  {body}
                </button>
              ) : (
                <div
                  data-testid={`step-dot-${step}`}
                  data-status={status}
                  aria-current={status === "current" ? "step" : undefined}
                  className={row}
                >
                  {body}
                </div>
              )}
              {/* Connector to the next circle: accent up to the current step. */}
              {i < STEP_ORDER.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute -bottom-[16px] left-[21px] top-[40px] w-0.5 rounded-full",
                    i < currentIdx ? "bg-primary" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepCircle({ status, number }: { status: StepStatus; number: number }) {
  const base =
    "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums";

  switch (status) {
    case "current":
      return (
        <span aria-hidden className={cn(base, "border-2 border-primary bg-primary/15 text-primary ring-4 ring-primary/15")}>
          {number}
        </span>
      );
    case "completed":
      return (
        <span aria-hidden className={cn(base, "bg-primary text-primary-foreground")}>
          <Check className="size-3.5" strokeWidth={2.5} />
        </span>
      );
    case "skipped":
      return (
        <span aria-hidden className={cn(base, "border border-dashed border-muted-foreground/50 bg-card text-muted-foreground")}>
          <Minus className="size-3.5" strokeWidth={2} />
        </span>
      );
    default:
      return (
        <span aria-hidden className={cn(base, "border border-border bg-card text-muted-foreground")}>
          {number}
        </span>
      );
  }
}
