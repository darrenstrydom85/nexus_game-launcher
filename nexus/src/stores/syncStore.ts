import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Types (enriched payload shape from Story 18.2) ────────────────────────────

export interface SyncError {
  source: string;
  gameId: string;
  message: string;
}

export interface SyncPhase {
  phase: "artwork" | "metadata";
  completed: number;
  total: number;
  currentGame: string | null;
  errors: SyncError[];
}

export interface SyncState {
  isActive: boolean;
  phases: SyncPhase[];
  overallCompleted: number;
  overallTotal: number;
  trigger: "onboarding" | "resync" | "auto" | null;
  startedAt: number | null;
}

/** Event payload shape after Story 18.2 enrichment (camelCase from Rust). */
export interface MetadataProgressPayload {
  phase: "artwork" | "metadata";
  completed: number;
  total: number;
  currentGame: string | null;
  trigger: "onboarding" | "resync" | "auto";
  error: { source: string; gameId: string; message: string } | null;
}

function toSyncError(
  err: { source: string; gameId: string; message: string },
): SyncError {
  return { source: err.source, gameId: err.gameId, message: err.message };
}

// ── Store ────────────────────────────────────────────────────────────────────

type SyncStore = SyncState & {
  applyProgressEvent: (payload: MetadataProgressPayload) => void;
};

const initialState: SyncState = {
  isActive: false,
  phases: [],
  overallCompleted: 0,
  overallTotal: 0,
  trigger: null,
  startedAt: null,
};

export const useSyncStore = create<SyncStore>()(
  devtools(
    (set) => ({
      ...initialState,

      applyProgressEvent: (payload: MetadataProgressPayload) => {
        set((state) => {
          const isNewRun =
            payload.completed === 0 ||
            (state.startedAt === null && payload.completed <= 1);

          let phases: SyncPhase[] = isNewRun ? [] : [...state.phases];
          const startedAt = isNewRun ? Date.now() : (state.startedAt ?? Date.now());
          const trigger: SyncState["trigger"] = isNewRun ? payload.trigger : (state.trigger ?? payload.trigger);

          const phaseIndex = phases.findIndex((p) => p.phase === payload.phase);
          const existingPhase = phaseIndex >= 0 ? phases[phaseIndex] : null;
          const nextErrors: SyncError[] = isNewRun
            ? (payload.error ? [toSyncError(payload.error)] : [])
            : [...(existingPhase?.errors ?? []), ...(payload.error ? [toSyncError(payload.error)] : [])];

          const phaseEntry: SyncPhase = {
            phase: payload.phase,
            completed: payload.completed,
            total: payload.total,
            currentGame: payload.currentGame,
            errors: nextErrors,
          };

          if (phaseIndex >= 0) {
            phases[phaseIndex] = phaseEntry;
          } else {
            phases.push(phaseEntry);
          }

          const overallCompleted = phases.reduce((sum, p) => sum + p.completed, 0);
          const overallTotal = phases.reduce((sum, p) => sum + p.total, 0);
          const allComplete =
            phases.length > 0 &&
            phases.every((p) => p.total > 0 && p.completed >= p.total);
          const isActive = !allComplete || overallTotal === 0;

          return {
            phases,
            overallCompleted,
            overallTotal,
            trigger,
            startedAt,
            isActive,
          };
        }, false, "applyProgressEvent");
      },
    }),
    { name: "SyncStore", enabled: import.meta.env.DEV },
  ),
);

// ── Listener registration (single Tauri listener for metadata-progress) ───────

let unlistenSync: UnlistenFn | null = null;

/** Legacy payload (Story 4.4) has gameId, status; no phase/total. */
interface LegacyMetadataProgressPayload {
  gameId?: string;
  gameName?: string;
  status?: string;
}

function isLegacyPayload(p: unknown): p is LegacyMetadataProgressPayload {
  return (
    typeof p === "object" &&
    p !== null &&
    "status" in p &&
    !("phase" in p)
  );
}

export interface InitSyncStoreOptions {
  /** Called when a legacy (pre–18.2) payload has status "complete". Use to refresh games. */
  onLegacyComplete?: () => void;
}

/**
 * Registers the Tauri `metadata-progress` listener and updates sync store state.
 * Call once at app startup (e.g. from App.tsx useEffect).
 * Returns a function to unlisten; safe to call multiple times.
 */
export function initSyncStore(options?: InitSyncStoreOptions): Promise<UnlistenFn> {
  if (unlistenSync) {
    return Promise.resolve(unlistenSync);
  }
  const onLegacyComplete = options?.onLegacyComplete;
  return listen<unknown>("metadata-progress", (event) => {
    const payload = event.payload;
    if (
      typeof payload === "object" &&
      payload !== null &&
      "phase" in payload &&
      "completed" in payload &&
      "total" in payload &&
      "trigger" in payload
    ) {
      useSyncStore.getState().applyProgressEvent(payload as MetadataProgressPayload);
    } else if (isLegacyPayload(payload) && payload.status === "complete") {
      onLegacyComplete?.();
    }
  }).then((fn) => {
    unlistenSync = fn;
    return fn;
  });
}
