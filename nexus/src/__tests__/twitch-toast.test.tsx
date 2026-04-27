import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { TwitchToast } from "@/components/Twitch/TwitchToast";
import { TwitchToastContainer } from "@/components/Twitch/TwitchToastContainer";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";

const mockToast = (
  id: string,
  login: string,
  displayName: string,
  gameName: string,
  title: string,
  isFavorite = false,
) => ({
  id,
  login,
  displayName,
  profileImageUrl: "https://example.com/avatar.png",
  gameName,
  title,
  isFavorite,
});

describe("Story 19.6: Twitch Go-Live Toast", () => {
  beforeEach(() => {
    vi.useRealTimers();
    useTwitchStore.setState({
      pendingToasts: [],
      previousLiveIds: new Set(),
    });
    useSettingsStore.setState({
      enableNotifications: true,
      twitchNotificationsEnabled: true,
      twitchNotificationsFavoritesOnly: false,
    });
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue({});
    vi.mocked(sendNotification).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("TwitchToast", () => {
    it("renders display name, game name, and title", () => {
      const toast = mockToast("1", "streamer1", "StreamerOne", "Just Chatting", "Hello world");
      const onDismiss = vi.fn();
      render(
        <TwitchToast toast={toast} onDismiss={onDismiss} onOpenChannel={() => {}} />,
      );
      expect(screen.getByText("StreamerOne is live")).toBeInTheDocument();
      expect(screen.getByText("Playing Just Chatting")).toBeInTheDocument();
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });

    it("has aria-label for accessibility", () => {
      const toast = mockToast("1", "s1", "DisplayName", "Game", "Title");
      render(
        <TwitchToast toast={toast} onDismiss={() => {}} onOpenChannel={() => {}} />,
      );
      const article = screen.getByRole("status", { name: /DisplayName is now live, playing Game/i });
      expect(article).toBeInTheDocument();
    });

    it("dismiss button has aria-label", () => {
      const toast = mockToast("1", "s1", "D", "G", "T");
      render(
        <TwitchToast toast={toast} onDismiss={() => {}} onOpenChannel={() => {}} />,
      );
      expect(screen.getByRole("button", { name: /dismiss notification/i })).toBeInTheDocument();
    });

    it("clicking toast body opens the channel and dismisses", async () => {
      const toast = mockToast("1", "streamer1", "StreamerOne", "Game", "Title");
      const onDismiss = vi.fn();
      const onOpenChannel = vi.fn();
      render(
        <TwitchToast toast={toast} onDismiss={onDismiss} onOpenChannel={onOpenChannel} />,
      );
      const status = screen.getByRole("status", { name: /StreamerOne is now live/i });
      await userEvent.click(status);
      expect(onOpenChannel).toHaveBeenCalledWith(toast);
      expect(onDismiss).toHaveBeenCalledWith("1");
    });

    it("clicking dismiss button dismisses without opening the channel", async () => {
      const toast = mockToast("1", "s1", "S", "G", "T");
      const onDismiss = vi.fn();
      const onOpenChannel = vi.fn();
      render(
        <TwitchToast toast={toast} onDismiss={onDismiss} onOpenChannel={onOpenChannel} />,
      );
      await userEvent.click(screen.getByRole("button", { name: /dismiss notification/i }));
      expect(onOpenChannel).not.toHaveBeenCalled();
      expect(onDismiss).toHaveBeenCalledWith("1");
    });

    it("favorite streamer toast has gold left border", () => {
      const toast = mockToast("1", "s1", "S", "G", "T", true);
      const { container } = render(
        <TwitchToast toast={toast} onDismiss={() => {}} onOpenChannel={() => {}} />,
      );
      const article = container.querySelector("article");
      expect(article?.className).toMatch(/border-l-2/);
      expect(article?.className).toContain("yellow");
    });

    it("non-favorite toast has no gold border", () => {
      const toast = mockToast("1", "s1", "S", "G", "T", false);
      const { container } = render(
        <TwitchToast toast={toast} onDismiss={() => {}} onOpenChannel={() => {}} />,
      );
      const article = container.querySelector("article");
      expect(article?.className).not.toMatch(/border-yellow-500/);
    });
  });

  describe("TwitchToastContainer", () => {
    it("shows up to 3 toasts when notifications enabled", () => {
      useTwitchStore.setState({
        pendingToasts: [
          mockToast("1", "a", "A", "G", "T"),
          mockToast("2", "b", "B", "G", "T"),
          mockToast("3", "c", "C", "G", "T"),
        ],
      });
      render(<TwitchToastContainer />);
      expect(screen.getByText("A is live")).toBeInTheDocument();
      expect(screen.getByText("B is live")).toBeInTheDocument();
      expect(screen.getByText("C is live")).toBeInTheDocument();
    });

    it("shows max 3 toasts when queue has more", () => {
      useTwitchStore.setState({
        pendingToasts: [
          mockToast("1", "a", "A", "G", "T"),
          mockToast("2", "b", "B", "G", "T"),
          mockToast("3", "c", "C", "G", "T"),
          mockToast("4", "d", "D", "G", "T"),
        ],
      });
      render(<TwitchToastContainer />);
      expect(screen.getByText("A is live")).toBeInTheDocument();
      expect(screen.getByText("B is live")).toBeInTheDocument();
      expect(screen.getByText("C is live")).toBeInTheDocument();
      expect(screen.queryByText("D is live")).not.toBeInTheDocument();
    });

    it("renders nothing when notifications disabled", () => {
      useSettingsStore.setState({ twitchNotificationsEnabled: false });
      useTwitchStore.setState({
        pendingToasts: [mockToast("1", "a", "A", "G", "T")],
      });
      render(<TwitchToastContainer />);
      expect(screen.queryByText("A is live")).not.toBeInTheDocument();
    });

    it("when favorites_only enabled, only shows favorite toasts", () => {
      useSettingsStore.setState({ twitchNotificationsFavoritesOnly: true });
      useTwitchStore.setState({
        pendingToasts: [
          mockToast("1", "a", "A", "G", "T", false),
          mockToast("2", "b", "B", "G", "T", true),
        ],
      });
      render(<TwitchToastContainer />);
      expect(screen.queryByText("A is live")).not.toBeInTheDocument();
      expect(screen.getByText("B is live")).toBeInTheDocument();
    });

    it("clicking a toast invokes the in-app stream window", async () => {
      useTwitchStore.setState({
        pendingToasts: [mockToast("1", "streamer1", "StreamerOne", "Game", "Title")],
      });
      render(<TwitchToastContainer />);
      await userEvent.click(screen.getByText("StreamerOne is live"));
      expect(invoke).toHaveBeenCalledWith("popout_stream", {
        channelLogin: "streamer1",
        channelDisplayName: "StreamerOne",
        twitchGameId: null,
        twitchGameName: "Game",
      });
      expect(useTwitchStore.getState().pendingToasts).toHaveLength(0);
    });

    it("toast auto-dismisses after 5 seconds", async () => {
      vi.useFakeTimers();
      useTwitchStore.setState({
        pendingToasts: [mockToast("1", "a", "A", "G", "T")],
      });
      render(<TwitchToastContainer />);
      expect(screen.getByText("A is live")).toBeInTheDocument();
      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
      expect(useTwitchStore.getState().pendingToasts).toHaveLength(0);
      vi.useRealTimers();
    });
  });

  describe("go-live detection (twitchStore)", () => {
    it("does not add toasts when response is stale", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      vi.mocked(invoke).mockResolvedValue({
        data: [
          {
            id: "ch1",
            login: "u1",
            displayName: "User1",
            profileImageUrl: "https://x/y",
            isLive: true,
            stream: {
              title: "Live",
              gameName: "Game",
              gameId: "g1",
              viewerCount: 1,
              thumbnailUrl: "https://x",
              startedAt: new Date().toISOString(),
            },
          },
        ],
        stale: true,
        cachedAt: Date.now(),
      });
      useTwitchStore.setState({ previousLiveIds: new Set() });
      await useTwitchStore.getState().fetchFollowedStreams();
      expect(useTwitchStore.getState().pendingToasts).toHaveLength(0);
    });

    it("adds toast when streamer transitions offline to live (not stale, had previous state)", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      const ch1 = {
        id: "ch1",
        login: "user1",
        displayName: "User1",
        profileImageUrl: "https://x/y",
        isLive: true,
        stream: {
          title: "Live",
          gameName: "Game",
          gameId: "g1",
          viewerCount: 1,
          thumbnailUrl: "https://x",
          startedAt: new Date().toISOString(),
        },
      };
      const ch2 = {
        id: "ch2",
        login: "streamer1",
        displayName: "Streamer1",
        profileImageUrl: "https://x/y",
        isLive: true,
        stream: {
          title: "Hello",
          gameName: "Just Chatting",
          gameId: "g1",
          viewerCount: 10,
          thumbnailUrl: "https://x",
          startedAt: new Date().toISOString(),
        },
      };
      vi.mocked(invoke)
        .mockResolvedValueOnce({
          data: [ch1],
          stale: false,
          cachedAt: Date.now(),
        })
        .mockResolvedValueOnce({
          data: [ch1, ch2],
          stale: false,
          cachedAt: Date.now(),
        });
      await useTwitchStore.getState().fetchFollowedStreams();
      expect(useTwitchStore.getState().pendingToasts).toHaveLength(0);
      await useTwitchStore.getState().fetchFollowedStreams();
      expect(useTwitchStore.getState().pendingToasts).toHaveLength(1);
      expect(useTwitchStore.getState().pendingToasts[0].login).toBe("streamer1");
      expect(useTwitchStore.getState().pendingToasts[0].displayName).toBe("Streamer1");
      await act(async () => {
        await Promise.resolve();
      });
      expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({
        title: "Streamer1 is live",
        body: "Playing Just Chatting: Hello",
        extra: {
          kind: "twitch",
          login: "streamer1",
          displayName: "Streamer1",
          gameName: "Just Chatting",
        },
        autoCancel: true,
      }));
    });

    it("does not add toast for streamer already live in previous poll", async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      useTwitchStore.setState({ previousLiveIds: new Set(["ch1"]) });
      vi.mocked(invoke).mockResolvedValue({
        data: [
          {
            id: "ch1",
            login: "u1",
            displayName: "User1",
            profileImageUrl: "https://x/y",
            isLive: true,
            stream: {
              title: "Live",
              gameName: "Game",
              gameId: "g1",
              viewerCount: 1,
              thumbnailUrl: "https://x",
              startedAt: new Date().toISOString(),
            },
          },
        ],
        stale: false,
        cachedAt: Date.now(),
      });
      await useTwitchStore.getState().fetchFollowedStreams();
      expect(useTwitchStore.getState().pendingToasts).toHaveLength(0);
    });
  });
});
