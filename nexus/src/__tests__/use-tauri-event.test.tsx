import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const mockUnlisten = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  listen: (...args: unknown[]) => mockListen(...args),
}));

import { useTauriEvent } from "@/hooks/use-tauri-event";

beforeEach(() => {
  mockListen.mockReset();
  mockUnlisten.mockReset();
  mockListen.mockResolvedValue(mockUnlisten);
});

describe("useTauriEvent", () => {
  it("calls listen with the event name on mount", () => {
    const handler = vi.fn();
    renderHook(() => useTauriEvent("test-event", handler));

    expect(mockListen).toHaveBeenCalledTimes(1);
    expect(mockListen).toHaveBeenCalledWith("test-event", expect.any(Function));
  });

  it("calls unlisten on unmount", async () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useTauriEvent("test-event", handler));

    await vi.waitFor(() => {
      expect(mockUnlisten).not.toHaveBeenCalled();
    });

    unmount();

    await vi.waitFor(() => {
      expect(mockUnlisten).toHaveBeenCalledTimes(1);
    });
  });

  it("forwards the event payload to the handler", async () => {
    const handler = vi.fn();
    let capturedCallback: ((event: { payload: string }) => void) | undefined;

    mockListen.mockImplementation(
      (_name: string, cb: (event: { payload: string }) => void) => {
        capturedCallback = cb;
        return Promise.resolve(mockUnlisten);
      },
    );

    renderHook(() => useTauriEvent<string>("test-event", handler));

    capturedCallback?.({ payload: "hello from rust" });

    expect(handler).toHaveBeenCalledWith("hello from rust");
  });
});
