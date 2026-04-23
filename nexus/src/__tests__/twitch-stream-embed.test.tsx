import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { StreamEmbed } from "@/components/Twitch/StreamEmbed";

describe("StreamEmbed (Story A1)", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "twitch_watch_session_start") return Promise.resolve(7);
      if (cmd === "twitch_watch_session_end") return Promise.resolve();
      return Promise.resolve({});
    });
    vi.mocked(openUrl).mockClear();
  });

  it("renders the player iframe with the correct channel and parent params", () => {
    render(
      <StreamEmbed
        channelLogin="shroud"
        channelDisplayName="Shroud"
        twitchGameName="VALORANT"
      />,
    );
    const player = screen.getByTestId("stream-embed-player");
    const src = player.getAttribute("src") ?? "";
    expect(src).toContain("https://player.twitch.tv/?channel=shroud");
    expect(src).toContain("parent=tauri.localhost");
    expect(src).toContain("parent=localhost");
    expect(src).toContain("autoplay=true");
    expect(player).toHaveAttribute("title", expect.stringContaining("Shroud"));
  });

  it("toggles chat panel and pop-out callback fires", () => {
    const onPopOut = vi.fn();
    render(
      <StreamEmbed
        channelLogin="ninja"
        defaultChatVisible={true}
        onPopOut={onPopOut}
      />,
    );
    expect(screen.getByTestId("stream-embed-chat")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/hide chat/i));
    expect(screen.queryByTestId("stream-embed-chat")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("stream-embed-popout"));
    expect(onPopOut).toHaveBeenCalledTimes(1);
  });

  it("opens twitch.tv via openUrl when external-link button is clicked", () => {
    render(<StreamEmbed channelLogin="pokimane" />);
    fireEvent.click(screen.getByLabelText(/open on twitch.tv/i));
    expect(openUrl).toHaveBeenCalledWith("https://twitch.tv/pokimane");
  });

  it("starts a watch session on mount and ends it on unmount", async () => {
    const { unmount } = render(
      <StreamEmbed channelLogin="shroud" trackWatchSession={true} />,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith(
      "twitch_watch_session_start",
      expect.objectContaining({ channelLogin: "shroud" }),
    );
    unmount();
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).toHaveBeenCalledWith(
      "twitch_watch_session_end",
      expect.objectContaining({ sessionId: 7 }),
    );
  });

  it("does not call session commands when tracking is disabled (pop-out window)", async () => {
    render(<StreamEmbed channelLogin="shroud" trackWatchSession={false} />);
    await Promise.resolve();
    await Promise.resolve();
    expect(invoke).not.toHaveBeenCalledWith(
      "twitch_watch_session_start",
      expect.anything(),
    );
  });

  it("invokes open_twitch_login when the Sign in button is clicked", () => {
    render(<StreamEmbed channelLogin="shroud" />);
    fireEvent.click(screen.getByTestId("stream-embed-signin"));
    expect(invoke).toHaveBeenCalledWith("open_twitch_login");
  });
});
