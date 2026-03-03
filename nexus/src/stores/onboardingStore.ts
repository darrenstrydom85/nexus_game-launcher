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
  confirm: "Confirm",
};

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
  setCurrentStep: (step: OnboardingStep) => void;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: OnboardingStep) => void;
  skipStep: (step: OnboardingStep) => void;
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
      setCurrentStep: (step) =>
        set({ currentStep: step }, false, "setCurrentStep"),
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
