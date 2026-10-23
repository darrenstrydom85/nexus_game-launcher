import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, renderHook, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { NowPlayingWidget, WIDGET_EVENTS } from "@/components/shared/NowPlayingWidget";
import { useNowPlayingWidget } from "@/hooks/useNowPlayingWidget";
import { useGameStore, type ActiveSession } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";

const win = vi.hoisted(() => ({
  minimized: false,
  onFocus: null as null | (() => void),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isMinimized: () => Promise.resolve(win.minimized),
    isVisible: () => Promise.resolve(true),
    onResized: () => Promise.resolve(() => {}),
    onFocusChanged: (cb: () => void) => {
      win.onFocus = cb;
      return Promise.resolve(() => {});
    },
  }),
}));

const session: ActiveSession = {
  sessionId: "s1",
  gameId: "g1",
  gameName: "Crimson Desert",
  coverUrl: null,
  heroUrl: null,
  startedAt: new Date(Date.now() - 65_000).toISOString(),
  dominantColor: "rgb(0,0,0)",
  pid: 1,
  exeName: "cd.exe",
  folderPath: null,
  potentialExeNames: null,
  processDetected: true,
  hasDbSession: true,
};

let handlers: Record<string, (e: { payload: unknown }) => void>;

beforeEach(() => {
  handlers = {};
  vi.mocked(listen).mockImplementation((name, cb) => {
    handlers[name] = cb as (e: { payload: unknown }) => void;
    return Promise.resolve(() => {});
  });
  vi.mocked(emit).mockClear();
  vi.mocked(invoke).mockClear();
  win.minimized = false;
  useGameStore.setState({ activeSession: null });
  useUiStore.setState({ detailOverlayGameId: null });
});

describe("NowPlayingWidget", () => {
  async function renderWithSession() {
    render(<NowPlayingWidget />);
    await waitFor(() => expect(emit).toHaveBeenCalledWith(WIDGET_EVENTS.ready));
    act(() =>
      handlers[WIDGET_EVENTS.session]({
        payload: { gameName: "Crimson Desert", coverUrl: null, startedAt: session.startedAt, launching: false },
      }),
    );
    vi.mocked(emit).mockClear();
  }

  it("opens the game from anywhere but the buttons", async () => {
    await renderWithSession();
    expect(screen.getByText("Crimson Desert")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("now-playing-widget-stop"));
    fireEvent.click(screen.getByTestId("now-playing-widget-close"));
    expect(vi.mocked(emit).mock.calls.map((c) => c[0])).toEqual([WIDGET_EVENTS.stop, WIDGET_EVENTS.dismiss]);

    fireEvent.click(screen.getByTestId("now-playing-widget-open"));
    expect(emit).toHaveBeenLastCalledWith(WIDGET_EVENTS.open);
  });
});

describe("useNowPlayingWidget", () => {
  const lastOpen = () => {
    const calls = vi.mocked(invoke).mock.calls.filter((c) => c[0] === "set_now_playing_widget");
    return calls[calls.length - 1]?.[1];
  };

  it("opens while a game runs and Nexus is minimized, until dismissed", async () => {
    renderHook(() => useNowPlayingWidget(vi.fn()));
    act(() => useGameStore.setState({ activeSession: session }));
    expect(lastOpen()).toEqual({ open: false });

    win.minimized = true;
    await act(async () => win.onFocus!());
    expect(lastOpen()).toEqual({ open: true });
    expect(emit).toHaveBeenCalledWith(WIDGET_EVENTS.session, expect.objectContaining({ gameName: "Crimson Desert" }));

    act(() => handlers[WIDGET_EVENTS.dismiss]({ payload: null }));
    expect(lastOpen()).toEqual({ open: false });
  });

  it("restores Nexus on the game's page when the widget is clicked", () => {
    renderHook(() => useNowPlayingWidget(vi.fn()));
    act(() => useGameStore.setState({ activeSession: session }));

    act(() => handlers[WIDGET_EVENTS.open]({ payload: null }));
    expect(invoke).toHaveBeenCalledWith("show_main_window");
    expect(useUiStore.getState().detailOverlayGameId).toBe("g1");
  });
});
