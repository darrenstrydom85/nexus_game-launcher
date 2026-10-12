import { describe, it, expect, beforeEach } from "vitest";
import { useOnboardingStore, STEP_ORDER } from "@/stores/onboardingStore";

describe("onboardingStore", () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
  });

  it("has correct initial state", () => {
    const state = useOnboardingStore.getState();
    expect(state.isCompleted).toBe(false);
    expect(state.currentStep).toBe("welcome");
    expect(state.skippedSteps).toEqual([]);
    expect(state.completedSteps).toEqual([]);
  });

  it("skipStep adds step to skipped list", () => {
    useOnboardingStore.getState().skipStep("steamgriddb");
    expect(useOnboardingStore.getState().skippedSteps).toEqual(["steamgriddb"]);
  });

  it("skipStep prevents duplicate entries", () => {
    useOnboardingStore.getState().skipStep("steamgriddb");
    useOnboardingStore.getState().skipStep("steamgriddb");
    expect(useOnboardingStore.getState().skippedSteps).toHaveLength(1);
  });

  it("skipStep accumulates multiple skipped steps", () => {
    useOnboardingStore.getState().skipStep("steamgriddb");
    useOnboardingStore.getState().skipStep("igdb");
    expect(useOnboardingStore.getState().skippedSteps).toEqual([
      "steamgriddb",
      "igdb",
    ]);
  });

  it("completeOnboarding marks as completed", () => {
    useOnboardingStore.getState().completeOnboarding();
    const state = useOnboardingStore.getState();
    expect(state.isCompleted).toBe(true);
  });

  it("resetOnboarding restores initial state", () => {
    useOnboardingStore.setState({ currentStep: "sources" });
    useOnboardingStore.getState().skipStep("steamgriddb");
    useOnboardingStore.getState().completeOnboarding();
    useOnboardingStore.getState().resetOnboarding();
    const state = useOnboardingStore.getState();
    expect(state.isCompleted).toBe(false);
    expect(state.currentStep).toBe("welcome");
    expect(state.skippedSteps).toEqual([]);
    expect(state.completedSteps).toEqual([]);
  });

  it("STEP_ORDER has 5 steps", () => {
    expect(STEP_ORDER).toHaveLength(5);
    expect(STEP_ORDER).toEqual(["welcome", "steamgriddb", "igdb", "sources", "confirm"]);
  });

  it("goNext skips over pre-skipped steps", () => {
    useOnboardingStore.getState().skipStep("steamgriddb");
    useOnboardingStore.getState().skipStep("igdb");
    // From welcome → should jump straight to sources
    useOnboardingStore.getState().goNext();
    expect(useOnboardingStore.getState().currentStep).toBe("sources");
  });

  it("goBack skips over pre-skipped steps", () => {
    useOnboardingStore.getState().skipStep("steamgriddb");
    useOnboardingStore.getState().skipStep("igdb");
    useOnboardingStore.setState({ currentStep: "sources" });
    useOnboardingStore.getState().goBack();
    // Should land on welcome, not igdb or steamgriddb
    expect(useOnboardingStore.getState().currentStep).toBe("welcome");
  });

  it("skipCurrent marks the current step skipped (not completed) and advances", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb", completedSteps: ["welcome"] });
    useOnboardingStore.getState().skipCurrent();
    const state = useOnboardingStore.getState();
    expect(state.currentStep).toBe("igdb");
    expect(state.skippedSteps).toEqual(["steamgriddb"]);
    expect(state.completedSteps).toEqual(["welcome"]);
  });

  it("skipCurrent replaces an earlier completion of the same step", () => {
    useOnboardingStore.setState({ currentStep: "igdb", completedSteps: ["welcome", "steamgriddb", "igdb"] });
    useOnboardingStore.getState().skipCurrent();
    expect(useOnboardingStore.getState().completedSteps).not.toContain("igdb");
    expect(useOnboardingStore.getState().skippedSteps).toContain("igdb");
  });

  it("skipCurrent hops over pre-skipped steps like goNext", () => {
    useOnboardingStore.getState().skipStep("igdb");
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
    useOnboardingStore.getState().skipCurrent();
    expect(useOnboardingStore.getState().currentStep).toBe("sources");
  });

  it("goNext only skips intermediate skipped steps, not the last one", () => {
    useOnboardingStore.getState().skipStep("steamgriddb");
    // igdb is NOT skipped — should land there
    useOnboardingStore.getState().goNext();
    expect(useOnboardingStore.getState().currentStep).toBe("igdb");
  });
});
