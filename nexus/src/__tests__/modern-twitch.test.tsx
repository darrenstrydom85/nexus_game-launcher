import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { TwitchPage } from "@/modern/twitch/TwitchPage";
import { useTwitchStore, type TwitchChannel } from "@/stores/twitchStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore } from "@/stores/uiStore";
import { TooltipProvider } from "@/components/ui/tooltip";

function channel(login: string, game: string | null, viewers = 10, isFavorite = false): TwitchChannel {
  return {
    id: `id-${login}`,
    login,
    displayName: login.toUpperCase(),
    profileImageUrl: "",
    isLive: game !== null,
    isFavorite,
    stream: game
      ? { title: `${login} plays ${game}`, gameName: game, gameId: "1", viewerCount: viewers, thumbnailUrl: "t-{width}x{height}", startedAt: new Date().toISOString() }
      : null,
  };
}

let channels: TwitchChannel[] = [];
let authenticated = true;

function seed(list: TwitchChannel[]) {
  channels = list;
  useTwitchStore.setState({
    isAuthenticated: authenticated,
    channels: list,
    liveStreams: list
      .filter((c) => c.stream)
      .map((c) => ({ ...c.stream!, login: c.login, displayName: c.displayName, profileImageUrl: c.profileImageUrl })),
    isLoading: false,
    error: null,
    stale: false,
    cachedAt: null,
    trendingGames: [],
  });
}

async function renderPage() {
  render(<TwitchPage />, { wrapper: TooltipProvider });
  await act(async () => {});
}

describe("v1 Twitch page", () => {
  beforeEach(() => {
    authenticated = true;
    useGameStore.setState({ games: [{ id: "g1", name: "Hades" } as Game] });
    useUiStore.setState({ twitchPanelScrollToGameName: null });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "validate_twitch_token" || cmd === "twitch_auth_status") return Promise.resolve({ authenticated });
      if (cmd === "get_twitch_followed_channels") return Promise.resolve({ data: channels, stale: false, cachedAt: null });
      if (cmd === "get_twitch_trending_library_games") return Promise.resolve({ data: [], stale: false, cachedAt: null });
      return Promise.resolve(null);
    });
    seed([channel("ana", "Hades", 50, true), channel("bob", "Celeste", 500), channel("cat", "Hades", 5), channel("dan", null)]);
  });

  it("offers to connect when signed out", async () => {
    authenticated = false;
    seed([]);
    await renderPage();
    expect(screen.queryByTestId("twitch-page")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("groups the rail into favourites, live and a collapsed offline list", async () => {
    await renderPage();
    const rail = screen.getByTestId("twitch-rail");
    expect(within(within(rail).getByRole("region", { name: "Favourites" })).getAllByRole("button").map((b) => b.dataset.testid)).toEqual([
      "twitch-channel-ana",
    ]);
    expect(within(within(rail).getByRole("region", { name: "Live" })).getAllByRole("button").map((b) => b.dataset.testid)).toEqual([
      "twitch-channel-bob",
      "twitch-channel-cat",
    ]);
    expect(screen.queryByTestId("twitch-channel-dan")).not.toBeInTheDocument();
    fireEvent.click(within(rail).getByRole("button", { name: /offline/i }));
    expect(screen.getByTestId("twitch-channel-dan")).toBeInTheDocument();
  });

  it("filters channels by name or game", async () => {
    await renderPage();
    fireEvent.change(screen.getByPlaceholderText("Filter 4 channels"), { target: { value: "celeste" } });
    const rail = screen.getByTestId("twitch-rail");
    expect(within(rail).getAllByRole("button", { name: /BOB/ })).toHaveLength(1);
    expect(within(rail).queryByText("ANA")).not.toBeInTheDocument();
  });

  it("features a live favourite, lists the rest, and filters by game", async () => {
    await renderPage();
    const tiles = () => screen.queryAllByTestId(/^twitch-stream-/).map((el) => el.dataset.testid);
    expect(screen.getByTestId("twitch-featured-ana")).toHaveTextContent("Your favourite is live");
    expect(tiles()).toEqual(["twitch-stream-bob", "twitch-stream-cat"]);
    fireEvent.click(screen.getByTestId("twitch-game-chip-Celeste"));
    expect(screen.getByTestId("twitch-featured-bob")).toHaveTextContent("Top Celeste stream");
    expect(tiles()).toEqual([]);
  });

  it("opens filtered to a game when sent from a library live badge", async () => {
    useUiStore.setState({ twitchPanelScrollToGameName: "hades" });
    await renderPage();
    expect(screen.getByTestId("twitch-game-chip-Hades")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("twitch-stream-bob")).not.toBeInTheDocument();
    expect(useUiStore.getState().twitchPanelScrollToGameName).toBeNull();
  });

  it("watches in a popout", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /^Watch BOB/ }));
    expect(invoke).toHaveBeenCalledWith("popout_stream", expect.objectContaining({ channelLogin: "bob", twitchGameName: "Celeste" }));
  });

  it("stops at 20 favourites", async () => {
    const many = Array.from({ length: 20 }, (_, i) => channel(`fav${i}`, null, 0, true));
    seed([...many, channel("bob", "Celeste", 500)]);
    const toggle = vi.spyOn(useTwitchStore.getState(), "toggleFavorite");
    await renderPage();
    const star = screen.getByRole("button", { name: "Favourite BOB" });
    expect(star).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(star);
    expect(toggle).not.toHaveBeenCalled();
  });

  it("shows a channel's details from the rail", async () => {
    await renderPage();
    fireEvent.click(screen.getByTestId("twitch-channel-bob"));
    expect(screen.getByTestId("twitch-channel-bob")).toHaveAttribute("aria-current", "true");
    expect(screen.queryByTestId("twitch-featured-ana")).not.toBeInTheDocument();
    expect(screen.getByTestId("twitch-channel-view")).toHaveTextContent("@bob");
  });

  it("shows more of the channel's game and links a game you own", async () => {
    useGameStore.setState({ games: [{ id: "g2", name: "Celeste" } as Game] });
    useTwitchStore.setState({
      streamsByGame: {
        Celeste: {
          cachedAt: Date.now(),
          data: {
            twitchGameName: "Celeste",
            streams: [
              { userId: "1", login: "bob", displayName: "BOB", profileImageUrl: "", title: "me", gameName: "Celeste", gameId: "1", viewerCount: 500, thumbnailUrl: "t", startedAt: new Date().toISOString() },
              { userId: "2", login: "zed", displayName: "ZED", profileImageUrl: "", title: "any%", gameName: "Celeste", gameId: "1", viewerCount: 900, thumbnailUrl: "t", startedAt: new Date().toISOString() },
            ],
          },
        },
      },
    });
    await renderPage();
    fireEvent.click(screen.getByTestId("twitch-channel-bob"));
    const more = screen.getByTestId("twitch-more-streams");
    expect(more).toHaveTextContent("More Celeste live now");
    expect(within(more).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Watch ZED: any%"]);
    fireEvent.click(within(more).getByRole("button", { name: "Watch ZED: any%" }));
    expect(invoke).toHaveBeenCalledWith("popout_stream", expect.objectContaining({ channelLogin: "zed" }));
    fireEvent.click(screen.getByRole("button", { name: "In your library" }));
    expect(useUiStore.getState().detailOverlayGameId).toBe("g2");
  });

  it("shows an offline channel without an empty player", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /offline/i }));
    fireEvent.click(screen.getByTestId("twitch-channel-dan"));
    expect(screen.getByTestId("twitch-channel-offline")).toBeInTheDocument();
    expect(screen.queryByTestId("twitch-channel-watch")).not.toBeInTheDocument();
  });
});
