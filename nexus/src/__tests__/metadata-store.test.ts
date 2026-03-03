import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { useMetadataStore } from "@/stores/metadataStore";
import type { MetadataProgressEvent } from "@/lib/tauri";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
  useMetadataStore.setState({
    keyStatus: null,
    fetchQueue: [],
    totalCacheBytes: 0,
    isVerifyingSteamgrid: false,
    isVerifyingIgdb: false,
  });
});

describe("MetadataStore", () => {
  it("starts with null keyStatus", () => {
    const state = useMetadataStore.getState();
    expect(state.keyStatus).toBeNull();
  });

  it("starts with empty fetchQueue", () => {
    const state = useMetadataStore.getState();
    expect(state.fetchQueue).toEqual([]);
  });

  it("loadKeyStatus fetches and stores key status", async () => {
    mockInvoke.mockResolvedValueOnce({
      steamgrid: true,
      igdb: true,
      availability: "both",
    });

    await useMetadataStore.getState().loadKeyStatus();

    const state = useMetadataStore.getState();
    expect(state.keyStatus).toEqual({
      steamgrid: true,
      igdb: true,
      availability: "both",
    });
    expect(mockInvoke).toHaveBeenCalledWith("get_key_status");
  });

  it("loadKeyStatus handles errors gracefully", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("fail"));

    await useMetadataStore.getState().loadKeyStatus();

    const state = useMetadataStore.getState();
    expect(state.keyStatus).toBeNull();
  });

  it("verifySteamgrid sets loading state and returns result", async () => {
    mockInvoke
      .mockResolvedValueOnce({ valid: true, message: "OK" })
      .mockResolvedValueOnce({
        steamgrid: true,
        igdb: false,
        availability: "steamgrid_only",
      });

    const result = await useMetadataStore.getState().verifySteamgrid();

    expect(result.valid).toBe(true);
    expect(result.message).toBe("OK");
    expect(useMetadataStore.getState().isVerifyingSteamgrid).toBe(false);
  });

  it("verifyIgdb sets loading state and returns result", async () => {
    mockInvoke
      .mockResolvedValueOnce({ valid: true, message: "OK" })
      .mockResolvedValueOnce({
        steamgrid: false,
        igdb: true,
        availability: "igdb_only",
      });

    const result = await useMetadataStore.getState().verifyIgdb();

    expect(result.valid).toBe(true);
    expect(useMetadataStore.getState().isVerifyingIgdb).toBe(false);
  });

  it("triggerMetadataFetch adds to queue", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useMetadataStore.getState().triggerMetadataFetch("game-1");

    expect(mockInvoke).toHaveBeenCalledWith("fetch_metadata", {
      gameId: "game-1",
    });
  });

  it("triggerMetadataFetch marks as failed on error", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("network error"));

    await useMetadataStore.getState().triggerMetadataFetch("game-1");

    const state = useMetadataStore.getState();
    const entry = state.fetchQueue.find((f) => f.gameId === "game-1");
    expect(entry?.status).toBe("failed");
  });

  it("triggerArtworkFetch calls fetch_artwork", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    await useMetadataStore.getState().triggerArtworkFetch("game-1");

    expect(mockInvoke).toHaveBeenCalledWith("fetch_artwork", {
      gameId: "game-1",
    });
  });

  it("loadCacheStats fetches and stores cache size", async () => {
    mockInvoke.mockResolvedValueOnce({ totalBytes: 1024000 });

    await useMetadataStore.getState().loadCacheStats();

    expect(useMetadataStore.getState().totalCacheBytes).toBe(1024000);
  });

  it("handleProgressEvent adds new entry", () => {
    const event: MetadataProgressEvent = {
      phase: "metadata",
      completed: 1,
      total: 10,
      currentGame: "Test Game",
      trigger: "resync",
      error: null,
      gameId: "g1",
      gameName: "Test Game",
      status: "fetching",
      progress: 0.5,
    };

    useMetadataStore.getState().handleProgressEvent(event);

    const state = useMetadataStore.getState();
    expect(state.fetchQueue).toHaveLength(1);
    expect(state.fetchQueue[0].gameId).toBe("g1");
    expect(state.fetchQueue[0].status).toBe("fetching");
    expect(state.fetchQueue[0].progress).toBe(0.5);
  });

  it("handleProgressEvent updates existing entry", () => {
    useMetadataStore.setState({
      fetchQueue: [
        { gameId: "g1", gameName: "Test", status: "queued" },
      ],
    });

    const event: MetadataProgressEvent = {
      phase: "metadata",
      completed: 1,
      total: 1,
      currentGame: null,
      trigger: "resync",
      error: null,
      gameId: "g1",
      gameName: "Test Game",
      status: "complete",
      progress: 1.0,
    };

    useMetadataStore.getState().handleProgressEvent(event);

    const state = useMetadataStore.getState();
    expect(state.fetchQueue).toHaveLength(1);
    expect(state.fetchQueue[0].status).toBe("complete");
    expect(state.fetchQueue[0].progress).toBe(1.0);
  });

  it("handleProgressEvent preserves other entries", () => {
    useMetadataStore.setState({
      fetchQueue: [
        { gameId: "g1", gameName: "Game 1", status: "complete" },
        { gameId: "g2", gameName: "Game 2", status: "fetching" },
      ],
    });

    const event: MetadataProgressEvent = {
      phase: "metadata",
      completed: 2,
      total: 2,
      currentGame: null,
      trigger: "resync",
      error: null,
      gameId: "g2",
      gameName: "Game 2",
      status: "complete",
      progress: 1.0,
    };

    useMetadataStore.getState().handleProgressEvent(event);

    const state = useMetadataStore.getState();
    expect(state.fetchQueue).toHaveLength(2);
    expect(state.fetchQueue[0].status).toBe("complete");
    expect(state.fetchQueue[1].status).toBe("complete");
  });
});
