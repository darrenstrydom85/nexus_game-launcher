import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { TwitchClipsRow } from "@/components/GameDetail/TwitchClipsRow";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";

const sampleClip = {
  id: "AbcClip",
  url: "https://clips.twitch.tv/AbcClip",
  embedUrl: "https://clips.twitch.tv/embed?clip=AbcClip",
  broadcasterId: "111",
  broadcasterName: "Shroud",
  creatorName: "Editor",
  title: "Insane play",
  viewCount: 4242,
  durationSecs: 24,
  thumbnailUrl: "https://clips-media-assets2.twitch.tv/abc-{width}x{height}.jpg",
  createdAt: "2024-01-01T00:00:00Z",
};

describe("TwitchClipsRow (Story A2)", () => {
  beforeEach(() => {
    useTwitchStore.setState({ isAuthenticated: true });
    useConnectivityStore.setState({ isOnline: true });
    vi.mocked(invoke).mockReset();
  });

  it("renders clip thumbnails after fetch + debounce", async () => {
    vi.mocked(invoke).mockResolvedValue({
      twitchGameId: "32982",
      twitchGameName: "GTA V",
      clips: [sampleClip, { ...sampleClip, id: "ClipB", title: "Second clip" }],
    });

    render(<TwitchClipsRow gameName="GTA V" />);

    await waitFor(
      () => expect(screen.getByText("Insane play")).toBeInTheDocument(),
      { timeout: 2000 },
    );

    expect(invoke).toHaveBeenCalledWith(
      "get_twitch_clips_for_game",
      expect.objectContaining({ gameName: "GTA V" }),
    );
    expect(screen.getByText("Second clip")).toBeInTheDocument();
    // View count is locale-formatted (toLocaleString); both clips share the
    // same count so we expect 2 matching nodes.
    expect(screen.getAllByText(/4\D?242 views/)).toHaveLength(2);
  });

  it("clicking a clip spawns a popout window via the popout_clip command", async () => {
    // First fetch is `get_twitch_clips_for_game`, subsequent calls are the
    // `popout_clip` invocation we're actually asserting against.
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_twitch_clips_for_game") {
        return Promise.resolve({
          twitchGameId: "32982",
          twitchGameName: "GTA V",
          clips: [sampleClip],
        });
      }
      if (cmd === "popout_clip") {
        return Promise.resolve();
      }
      return Promise.resolve(undefined);
    });
    render(<TwitchClipsRow gameName="GTA V" />);
    await waitFor(
      () => expect(screen.getByText("Insane play")).toBeInTheDocument(),
      { timeout: 2000 },
    );

    fireEvent.click(screen.getByLabelText(/Play clip: Insane play/));

    expect(invoke).toHaveBeenCalledWith(
      "popout_clip",
      expect.objectContaining({
        clipId: "AbcClip",
        clipTitle: "Insane play",
        broadcasterName: "Shroud",
      }),
    );
    // No inline iframe — the clip plays in its own Tauri window.
    expect(screen.queryByTestId("twitch-clip-embed")).not.toBeInTheDocument();
  });

  it("self-hides when not authenticated", () => {
    useTwitchStore.setState({ isAuthenticated: false });
    render(<TwitchClipsRow gameName="GTA V" />);
    expect(screen.queryByTestId("twitch-clips-row")).not.toBeInTheDocument();
  });

  it("self-hides when fetch returns zero clips", async () => {
    vi.mocked(invoke).mockResolvedValue({
      twitchGameId: "32982",
      twitchGameName: "GTA V",
      clips: [],
    });
    render(<TwitchClipsRow gameName="GTA V" />);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByText("Top clips this week")).not.toBeInTheDocument();
  });
});
