import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OnboardingWizard } from "@/components/Onboarding/OnboardingWizard";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import {
  useOnboardingStore,
  STEP_ORDER,
  getStepStatus,
} from "@/stores/onboardingStore";

const stepContent = {
  welcome: <div data-testid="step-welcome">Welcome</div>,
  steamgriddb: <div data-testid="step-steamgriddb">SteamGridDB</div>,
  igdb: <div data-testid="step-igdb">IGDB</div>,
  sources: <div data-testid="step-sources">Sources</div>,
  confirm: <div data-testid="step-confirm">Confirm</div>,
};

describe("Story 9.1: Onboarding Wizard Shell", () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
  });

  it("renders when onboarding is not completed", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("onboarding-wizard")).toBeInTheDocument();
  });

  it("does not render when onboarding is completed", () => {
    useOnboardingStore.getState().completeOnboarding();
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.queryByTestId("onboarding-wizard")).not.toBeInTheDocument();
  });

  it("renders as full-screen overlay", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    const wizard = screen.getByTestId("onboarding-wizard");
    expect(wizard.className).toContain("fixed");
    expect(wizard.className).toContain("inset-0");
  });

  it("shows current step content", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("step-welcome")).toBeInTheDocument();
  });

  it("navigates forward with Next button", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("step-steamgriddb")).toBeInTheDocument();
  });

  it("navigates back with Back button", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-back"));
    expect(screen.getByTestId("step-welcome")).toBeInTheDocument();
  });

  it("hides Back button on first step", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.queryByTestId("onboarding-back")).not.toBeInTheDocument();
  });

  it("hides Next button on last step", () => {
    useOnboardingStore.setState({ currentStep: "confirm" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.queryByTestId("onboarding-next")).not.toBeInTheDocument();
  });

  it("renders step indicator", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("step-indicator")).toBeInTheDocument();
  });

  it("renders footer navigation", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("onboarding-footer")).toBeInTheDocument();
  });
});

describe("StepIndicator", () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
  });

  it("renders 5 step dots", () => {
    render(<StepIndicator />);
    STEP_ORDER.forEach((step) => {
      expect(screen.getByTestId(`step-dot-${step}`)).toBeInTheDocument();
    });
  });

  it("shows labels: Welcome, Artwork, Metadata, Sources, Confirm", () => {
    render(<StepIndicator />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Artwork")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Confirm")).toBeInTheDocument();
  });

  it("current step has status=current", () => {
    render(<StepIndicator />);
    expect(screen.getByTestId("step-dot-welcome")).toHaveAttribute(
      "data-status",
      "current",
    );
  });

  it("completed step has status=completed", () => {
    useOnboardingStore.setState({
      currentStep: "steamgriddb",
      completedSteps: ["welcome"],
    });
    render(<StepIndicator />);
    expect(screen.getByTestId("step-dot-welcome")).toHaveAttribute(
      "data-status",
      "completed",
    );
  });

  it("skipped step has status=skipped", () => {
    useOnboardingStore.setState({
      currentStep: "igdb",
      skippedSteps: ["steamgriddb"],
    });
    render(<StepIndicator />);
    expect(screen.getByTestId("step-dot-steamgriddb")).toHaveAttribute(
      "data-status",
      "skipped",
    );
  });

  it("clicking completed step navigates back", () => {
    useOnboardingStore.setState({
      currentStep: "igdb",
      completedSteps: ["welcome", "steamgriddb"],
    });
    render(<StepIndicator />);
    fireEvent.click(screen.getByTestId("step-dot-welcome"));
    expect(useOnboardingStore.getState().currentStep).toBe("welcome");
  });
});

describe("getStepStatus", () => {
  it("returns current for active step", () => {
    expect(getStepStatus("welcome", "welcome", [], [])).toBe("current");
  });

  it("returns completed for completed step", () => {
    expect(getStepStatus("welcome", "steamgriddb", ["welcome"], [])).toBe("completed");
  });

  it("returns skipped for skipped step", () => {
    expect(getStepStatus("steamgriddb", "igdb", [], ["steamgriddb"])).toBe("skipped");
  });

  it("returns pending for future step", () => {
    expect(getStepStatus("confirm", "welcome", [], [])).toBe("pending");
  });
});

describe("onboardingStore navigation", () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
  });

  it("goNext advances step and marks current as completed", () => {
    useOnboardingStore.getState().goNext();
    expect(useOnboardingStore.getState().currentStep).toBe("steamgriddb");
    expect(useOnboardingStore.getState().completedSteps).toContain("welcome");
  });

  it("goBack goes to previous step", () => {
    useOnboardingStore.setState({ currentStep: "igdb" });
    useOnboardingStore.getState().goBack();
    expect(useOnboardingStore.getState().currentStep).toBe("steamgriddb");
  });

  it("goBack does nothing on first step", () => {
    useOnboardingStore.getState().goBack();
    expect(useOnboardingStore.getState().currentStep).toBe("welcome");
  });

  it("completeOnboarding sets isCompleted", () => {
    useOnboardingStore.getState().completeOnboarding();
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });
});
