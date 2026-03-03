import * as React from "react";
import { useOnboardingStore, type OnboardingStep } from "@/stores/onboardingStore";
import { StepIndicator } from "./StepIndicator";
import { Button } from "@/components/ui/button";
import { Titlebar } from "@/components/shared/Titlebar";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface OnboardingWizardProps {
  children: Record<OnboardingStep, React.ReactNode>;
}

export function OnboardingWizard({ children }: OnboardingWizardProps) {
  const isCompleted = useOnboardingStore((s) => s.isCompleted);
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const goNext = useOnboardingStore((s) => s.goNext);
  const goBack = useOnboardingStore((s) => s.goBack);

  if (isCompleted) return null;

  const isFirst = currentStep === "welcome";
  const isLast = currentStep === "confirm";

  return (
    <div
      data-testid="onboarding-wizard"
      className="fixed inset-0 z-[70] flex flex-col bg-background"
    >
      <Titlebar />

      {/* Header with step indicator */}
      <div className="flex items-center justify-center border-b border-border py-4">
        <StepIndicator />
      </div>

      {/* Step content */}
      <div
        data-testid="onboarding-step-content"
        className="flex flex-1 items-center justify-center overflow-y-auto p-8"
      >
        {children[currentStep]}
      </div>

      {/* Footer navigation */}
      <div
        data-testid="onboarding-footer"
        className="flex items-center justify-between border-t border-border px-8 py-4"
      >
        <div>
          {!isFirst && (
            <Button
              data-testid="onboarding-back"
              variant="ghost"
              className="gap-1"
              onClick={goBack}
            >
              <ChevronLeft className="size-4" />
              Back
            </Button>
          )}
        </div>
        <div>
          {!isLast && (
            <Button
              data-testid="onboarding-next"
              className="gap-1"
              onClick={goNext}
            >
              Next
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
