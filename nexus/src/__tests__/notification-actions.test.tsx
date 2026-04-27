import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { onAction, type Options } from "@tauri-apps/plugin-notification";
import { useNativeNotificationActions } from "@/hooks/useNativeNotificationActions";
import { useUiStore } from "@/stores/uiStore";

function Harness() {
  useNativeNotificationActions();
  return null;
}

describe("native notification actions", () => {
  let actionHandler: ((notification: Options) => void | Promise<void>) | null = null;
  const listener = {
    plugin: "notification",
    event: "actionPerformed",
    channelId: 1,
    unregister: vi.fn(() => Promise.resolve()),
  };

  beforeEach(() => {
    actionHandler = null;
    listener.unregister.mockReset();
    vi.mocked(onAction).mockReset();
    vi.mocked(onAction).mockImplementation(async (cb) => {
      actionHandler = cb;
      return listener;
    });
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({});
    useUiStore.setState({
      activeNav: "library",
      statsScrollTarget: null,
    });
  });

  it("opens Stats and scrolls to XP when an XP notification is clicked", async () => {
    render(<Harness />);

    await act(async () => {
      await actionHandler?.({
        title: "Level Up!",
        extra: { kind: "xp" },
      } as Options);
    });

    expect(invoke).toHaveBeenCalledWith("show_main_window");
    expect(useUiStore.getState().activeNav).toBe("stats");
    expect(useUiStore.getState().statsScrollTarget).toBe("xp");
  });

  it("opens Stats and scrolls to milestones when a milestone notification is clicked", async () => {
    render(<Harness />);

    await act(async () => {
      await actionHandler?.({
        title: "Milestone",
        extra: { kind: "milestone" },
      } as Options);
    });

    expect(invoke).toHaveBeenCalledWith("show_main_window");
    expect(useUiStore.getState().activeNav).toBe("stats");
    expect(useUiStore.getState().statsScrollTarget).toBe("milestones");
  });

  it("opens Twitch and pops out the stream when a Twitch notification is clicked", async () => {
    render(<Harness />);

    await act(async () => {
      await actionHandler?.({
        title: "Streamer is live",
        extra: {
          kind: "twitch",
          login: "streamer",
          displayName: "Streamer",
          gameName: "Game",
        },
      } as Options);
    });

    expect(invoke).toHaveBeenCalledWith("show_main_window");
    expect(invoke).toHaveBeenCalledWith("popout_stream", {
      channelLogin: "streamer",
      channelDisplayName: "Streamer",
      twitchGameId: null,
      twitchGameName: "Game",
    });
    expect(useUiStore.getState().activeNav).toBe("twitch");
  });
});
