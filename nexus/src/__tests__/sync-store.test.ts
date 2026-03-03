import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { listen } from "@tauri-apps/api/event";
import { useSyncStore, type MetadataProgressPayload, type SyncPhase } from "@/stores/syncStore";

const mockListen = vi.mocked(listen);

const initialSyncState = {
  isActive: false,
  phases: [] as SyncPhase[],
  overallCompleted: 0,
  overallTotal: 0,
  trigger: null as "onboarding" | "resync" | "auto" | null,
  startedAt: null as number | null,
};

beforeEach(() => {
  mockListen.mockReset();
  useSyncStore.setState(initialSyncState);
});

function payload(overrides: Partial<MetadataProgressPayload> = {}): MetadataProgressPayload {
  return {
    phase: "metadata",
    completed: 0,
    total: 10,
    currentGame: null,
    trigger: "resync",
    error: null,
    ...overrides,
  };
}

describe("SyncStore", () => {
  it("initial state is isActive false and empty phases", () => {
    const state = useSyncStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.phases).toEqual([]);
    expect(state.overallCompleted).toBe(0);
    expect(state.overallTotal).toBe(0);
    expect(state.trigger).toBeNull();
    expect(state.startedAt).toBeNull();
  });

  it("first event transitions isActive to true", () => {
    useSyncStore.getState().applyProgressEvent(payload({ completed: 1, total: 10 }));

    const state = useSyncStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.phases).toHaveLength(1);
    expect(state.phases[0].phase).toBe("metadata");
    expect(state.phases[0].completed).toBe(1);
    expect(state.phases[0].total).toBe(10);
  });

  it("progress increments overallCompleted", () => {
    useSyncStore.getState().applyProgressEvent(payload({ completed: 1, total: 10 }));
    useSyncStore.getState().applyProgressEvent(payload({ completed: 3, total: 10 }));

    const state = useSyncStore.getState();
    expect(state.overallCompleted).toBe(3);
    expect(state.overallTotal).toBe(10);
    expect(state.isActive).toBe(true);
  });

  it("completion (completed === total across all phases) sets isActive to false", () => {
    useSyncStore.getState().applyProgressEvent(payload({ phase: "metadata", completed: 10, total: 10 }));

    const state = useSyncStore.getState();
    expect(state.isActive).toBe(false);
    expect(state.overallCompleted).toBe(10);
    expect(state.overallTotal).toBe(10);
  });

  it("error events accumulate in errors array", () => {
    useSyncStore.getState().applyProgressEvent(
      payload({
        completed: 1,
        total: 2,
        error: { source: "SteamGridDB", gameId: "g1", message: "e1" },
      }),
    );
    useSyncStore.getState().applyProgressEvent(
      payload({
        completed: 2,
        total: 2,
        error: { source: "IGDB", gameId: "g2", message: "e2" },
      }),
    );

    const state = useSyncStore.getState();
    expect(state.phases[0].errors).toHaveLength(2);
    expect(state.phases[0].errors[0]).toEqual({
      source: "SteamGridDB",
      gameId: "g1",
      message: "e1",
    });
    expect(state.phases[0].errors[1]).toEqual({
      source: "IGDB",
      gameId: "g2",
      message: "e2",
    });
  });

  it("new run (completed === 0) clears previous errors", () => {
    useSyncStore.getState().applyProgressEvent(
      payload({
        completed: 1,
        total: 2,
        error: { source: "SteamGridDB", gameId: "g1", message: "old" },
      }),
    );
    useSyncStore.getState().applyProgressEvent(
      payload({ completed: 0, total: 5, trigger: "onboarding" }),
    );

    const state = useSyncStore.getState();
    expect(state.phases).toHaveLength(1);
    expect(state.phases[0].errors).toHaveLength(0);
    expect(state.phases[0].completed).toBe(0);
    expect(state.phases[0].total).toBe(5);
    expect(state.trigger).toBe("onboarding");
  });

  it("initSyncStore registers listener and applies enriched payload", async () => {
    let capturedHandler: ((ev: { event: string; id: number; payload: unknown }) => void) | null = null;
    mockListen.mockImplementation(
      ((_name: string, handler: (ev: { event: string; id: number; payload: unknown }) => void) => {
        capturedHandler = handler;
        return Promise.resolve(() => {});
      }) as typeof listen,
    );

    const initPromise = await import("@/stores/syncStore").then((m) =>
      m.initSyncStore(),
    );
    expect(mockListen).toHaveBeenCalledWith(
      "metadata-progress",
      expect.any(Function),
    );
    expect(capturedHandler).not.toBeNull();

    capturedHandler!({
      event: "metadata-progress",
      id: 0,
      payload: payload({ completed: 2, total: 10, trigger: "resync" }),
    });

    const state = useSyncStore.getState();
    expect(state.isActive).toBe(true);
    expect(state.overallCompleted).toBe(2);
    expect(state.overallTotal).toBe(10);
    expect(state.trigger).toBe("resync");

    initPromise(); // unlisten
  });
});
