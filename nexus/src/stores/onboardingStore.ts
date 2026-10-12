import { create } from "zustand";
import { devtools } from "zustand/middleware";

export type OnboardingStep =
  | "welcome"
  | "steamgriddb"
  | "igdb"
  | "sources"
  | "confirm";

export type StepStatus = "pending" | "current" | "completed" | "skipped";

export const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "steamgriddb",
  "igdb",
  "sources",
  "confirm",
];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  steamgriddb: "Artwork",
  igdb: "Metadata",
  sources: "Sources",
  confirm: "Your library",
};

/** One-line hint under each label in the step rail. */
export const STEP_SUBLABELS: Record<OnboardingStep, string> = {
  welcome: "A quick hello",
  steamgriddb: "SteamGridDB key",
  igdb: "IGDB keys",
  sources: "Launchers and folders",
  confirm: "Review and import",
};

/** Steps the user may pass over with "Skip for now". */
export const SKIPPABLE_STEPS: readonly OnboardingStep[] = ["steamgriddb", "igdb"];

export interface DetectedGame {
  name: string;
  source: string;
  sourceId: string | null;
  sourceHint: string | null;
  folderPath: string | null;
  exePath: string | null;
  exeName: string | null;
  launchUrl: string | null;
  sourceFolderId: string | null;
  potentialExeNames: string | null;
}

export interface OnboardingState {
  isCompleted: boolean;
  currentStep: OnboardingStep;
  skippedSteps: OnboardingStep[];
  completedSteps: OnboardingStep[];
  detectedGames: DetectedGame[];
}

export interface OnboardingActions {
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: OnboardingStep) => void;
  skipStep: (step: OnboardingStep) => void;
  /** "Skip for now": marks the current step skipped (not completed) and advances. */
  skipCurrent: () => void;
  markStepCompleted: (step: OnboardingStep) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  setDetectedGames: (games: DetectedGame[]) => void;
}

export type OnboardingStore = OnboardingState & OnboardingActions;

const initialState: OnboardingState = {
  isCompleted: false,
  currentStep: "welcome",
  skippedSteps: [],
  completedSteps: [],
  detectedGames: [],
};

export function getStepStatus(
  step: OnboardingStep,
  currentStep: OnboardingStep,
  completedSteps: OnboardingStep[],
  skippedSteps: OnboardingStep[],
): StepStatus {
  if (step === currentStep) return "current";
  if (completedSteps.includes(step)) return "completed";
  if (skippedSteps.includes(step)) return "skipped";
  return "pending";
}

export const useOnboardingStore = create<OnboardingStore>()(
  devtools(
    (set, get) => ({
      ...initialState,
      goNext: () => {
        const { currentStep, completedSteps, skippedSteps } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        const updated = completedSteps.includes(currentStep)
          ? completedSteps
          : [...completedSteps, currentStep];
        // Advance past any pre-skipped steps
        let nextIdx = idx + 1;
        while (nextIdx < STEP_ORDER.length - 1 && skippedSteps.includes(STEP_ORDER[nextIdx])) {
          nextIdx++;
        }
        if (nextIdx < STEP_ORDER.length) {
          set(
            { currentStep: STEP_ORDER[nextIdx], completedSteps: updated },
            false,
            "goNext",
          );
        }
      },
      goBack: () => {
        const { currentStep, skippedSteps } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        // Step back past any pre-skipped steps
        let prevIdx = idx - 1;
        while (prevIdx > 0 && skippedSteps.includes(STEP_ORDER[prevIdx])) {
          prevIdx--;
        }
        if (prevIdx >= 0) {
          set({ currentStep: STEP_ORDER[prevIdx] }, false, "goBack");
        }
      },
      goToStep: (step) => {
        const { currentStep } = get();
        const targetIdx = STEP_ORDER.indexOf(step);
        const currentIdx = STEP_ORDER.indexOf(currentStep);
        if (targetIdx <= currentIdx) {
          set({ currentStep: step }, false, "goToStep");
        }
      },
      skipStep: (step) =>
        set(
          (state) => ({
            skippedSteps: state.skippedSteps.includes(step)
              ? state.skippedSteps
              : [...state.skippedSteps, step],
          }),
          false,
          "skipStep",
        ),
      skipCurrent: () => {
        const { currentStep, completedSteps, skippedSteps } = get();
        let nextIdx = STEP_ORDER.indexOf(currentStep) + 1;
        while (nextIdx < STEP_ORDER.length - 1 && skippedSteps.includes(STEP_ORDER[nextIdx])) {
          nextIdx++;
        }
        if (nextIdx >= STEP_ORDER.length) return;
        set(
          {
            currentStep: STEP_ORDER[nextIdx],
            skippedSteps: skippedSteps.includes(currentStep)
              ? skippedSteps
              : [...skippedSteps, currentStep],
            completedSteps: completedSteps.filter((s) => s !== currentStep),
          },
          false,
          "skipCurrent",
        );
      },
      markStepCompleted: (step) =>
        set(
          (state) => ({
            completedSteps: state.completedSteps.includes(step)
              ? state.completedSteps
              : [...state.completedSteps, step],
          }),
          false,
          "markStepCompleted",
        ),
      completeOnboarding: () =>
        set(
          { isCompleted: true },
          false,
          "completeOnboarding",
        ),
      resetOnboarding: () => set(initialState, false, "resetOnboarding"),
      setDetectedGames: (games) =>
        set({ detectedGames: games }, false, "setDetectedGames"),
    }),
    { name: "OnboardingStore", enabled: import.meta.env.DEV },
  ),
);
