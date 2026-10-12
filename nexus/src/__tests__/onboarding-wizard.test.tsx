import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { OnboardingWizard } from "@/components/Onboarding/OnboardingWizard";
import { StepIndicator } from "@/components/Onboarding/StepIndicator";
import { StepFooter } from "@/components/Onboarding/StepFooter";
import { SteamGridDBStep } from "@/components/Onboarding/SteamGridDBStep";
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

  it("keeps the titlebar on top", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("titlebar")).toBeInTheDocument();
  });

  it("shows current step content", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("step-welcome")).toBeInTheDocument();
  });

  it("hides the footer and heading on the welcome step (the hero has its own button)", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.queryByTestId("onboarding-footer")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-eyebrow")).not.toBeInTheDocument();
  });

  it("renders footer navigation after the welcome step", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("onboarding-footer")).toBeInTheDocument();
  });

  it("shows the step eyebrow, title and description", () => {
    useOnboardingStore.setState({ currentStep: "sources" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("onboarding-eyebrow")).toHaveTextContent("Step 4 of 5");
    expect(screen.getByRole("heading", { level: 1, name: "Where your games live" })).toBeInTheDocument();
  });

  it("navigates forward with the default Continue button", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(screen.getByTestId("step-igdb")).toBeInTheDocument();
  });

  it("navigates back with Back button", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-back"));
    expect(screen.getByTestId("step-welcome")).toBeInTheDocument();
  });

  it("Back on the library step returns to sources", () => {
    useOnboardingStore.setState({ currentStep: "confirm" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-back"));
    expect(useOnboardingStore.getState().currentStep).toBe("sources");
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

  it("renders step indicator in the rail", () => {
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    const rail = screen.getByTestId("onboarding-rail");
    expect(within(rail).getByTestId("step-indicator")).toBeInTheDocument();
    expect(rail).toHaveTextContent("You can change any of this later in Settings.");
  });

  it("offers Skip for now only on the artwork and metadata steps", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    const { unmount } = render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("onboarding-skip")).toHaveTextContent("Skip for now");
    unmount();

    useOnboardingStore.setState({ currentStep: "igdb" });
    const second = render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.getByTestId("onboarding-skip")).toBeInTheDocument();
    second.unmount();

    useOnboardingStore.setState({ currentStep: "sources" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    expect(screen.queryByTestId("onboarding-skip")).not.toBeInTheDocument();
  });

  it("Skip for now advances and marks the step skipped, not completed", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb", completedSteps: ["welcome"] });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-skip"));

    const state = useOnboardingStore.getState();
    expect(state.currentStep).toBe("igdb");
    expect(state.skippedSteps).toContain("steamgriddb");
    expect(state.completedSteps).not.toContain("steamgriddb");
    expect(screen.getByTestId("step-dot-steamgriddb")).toHaveAttribute("data-status", "skipped");
  });

  it("moves focus to the new step's heading on step change", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    render(<OnboardingWizard>{stepContent}</OnboardingWizard>);
    fireEvent.click(screen.getByTestId("onboarding-next"));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Game details" }));
  });

  it("a step's own footer actions replace the default Continue", () => {
    useOnboardingStore.setState({ currentStep: "sources" });
    render(
      <OnboardingWizard>
        {{
          ...stepContent,
          sources: (
            <div data-testid="step-sources">
              <StepFooter>
                <button type="button" data-testid="custom-primary">Scan</button>
              </StepFooter>
            </div>
          ),
        }}
      </OnboardingWizard>,
    );
    const footer = screen.getByTestId("onboarding-footer");
    expect(within(footer).getByTestId("custom-primary")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-next")).not.toBeInTheDocument();
  });

  it("the default Continue returns when the step that claimed the footer leaves", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    render(
      <OnboardingWizard>
        {{
          ...stepContent,
          steamgriddb: (
            <StepFooter>
              <button type="button" data-testid="custom-primary" onClick={() => useOnboardingStore.getState().goNext()}>
                Go
              </button>
            </StepFooter>
          ),
        }}
      </OnboardingWizard>,
    );
    expect(screen.queryByTestId("onboarding-next")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("custom-primary"));
    expect(screen.getByTestId("step-igdb")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-next")).toBeInTheDocument();
  });
});

describe("Wizard with a real key step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "steamgriddb", completedSteps: ["welcome"] });
  });

  it("puts the step's primary action in the pinned footer, with no duplicate buttons", () => {
    render(<OnboardingWizard>{{ ...stepContent, steamgriddb: <SteamGridDBStep /> }}</OnboardingWizard>);
    const footer = screen.getByTestId("onboarding-footer");
    expect(within(footer).getByTestId("steamgriddb-next")).toBeInTheDocument();
    expect(screen.getAllByTestId("steamgriddb-next")).toHaveLength(1);
    expect(screen.queryByTestId("onboarding-next")).not.toBeInTheDocument();
  });

  it("the footer button submits the key form: verify, then continue", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    render(<OnboardingWizard>{{ ...stepContent, steamgriddb: <SteamGridDBStep /> }}</OnboardingWizard>);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), { target: { value: "abc" } });

    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-next"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("verify_steamgrid_key");
    expect(screen.getByTestId("steamgriddb-next")).toHaveTextContent("Continue");

    fireEvent.click(screen.getByTestId("steamgriddb-next"));
    expect(useOnboardingStore.getState().currentStep).toBe("igdb");
    expect(useOnboardingStore.getState().completedSteps).toContain("steamgriddb");
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

  it("shows labels: Welcome, Artwork, Metadata, Sources, Your library", () => {
    render(<StepIndicator />);
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Artwork")).toBeInTheDocument();
    expect(screen.getByText("Metadata")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Your library")).toBeInTheDocument();
  });

  it("shows a sub-label under each step", () => {
    render(<StepIndicator />);
    expect(screen.getByText("A quick hello")).toBeInTheDocument();
    expect(screen.getByText("SteamGridDB key")).toBeInTheDocument();
    expect(screen.getByText("IGDB keys")).toBeInTheDocument();
    expect(screen.getByText("Launchers and folders")).toBeInTheDocument();
    expect(screen.getByText("Review and import")).toBeInTheDocument();
  });

  it("current step has status=current and aria-current=step", () => {
    render(<StepIndicator />);
    const current = screen.getByTestId("step-dot-welcome");
    expect(current).toHaveAttribute("data-status", "current");
    expect(current).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("step-dot-igdb")).not.toHaveAttribute("aria-current");
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

  it("clicking a skipped step navigates back to it", () => {
    useOnboardingStore.setState({
      currentStep: "sources",
      completedSteps: ["welcome", "igdb"],
      skippedSteps: ["steamgriddb"],
    });
    render(<StepIndicator />);
    fireEvent.click(screen.getByTestId("step-dot-steamgriddb"));
    expect(useOnboardingStore.getState().currentStep).toBe("steamgriddb");
  });

  it("past steps are buttons; the current and future steps are not interactive", () => {
    useOnboardingStore.setState({
      currentStep: "igdb",
      completedSteps: ["welcome", "steamgriddb"],
    });
    render(<StepIndicator />);
    expect(screen.getByTestId("step-dot-welcome").tagName).toBe("BUTTON");
    expect(screen.getByTestId("step-dot-steamgriddb").tagName).toBe("BUTTON");
    expect(screen.getByTestId("step-dot-igdb").tagName).toBe("DIV");
    expect(screen.getByTestId("step-dot-confirm").tagName).toBe("DIV");
    expect(screen.getAllByRole("button")).toHaveLength(2);
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
