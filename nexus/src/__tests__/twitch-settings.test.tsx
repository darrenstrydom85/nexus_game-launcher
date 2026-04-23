import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TwitchSettings } from "@/components/Settings/TwitchSettings";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTwitchStore } from "@/stores/twitchStore";
import * as tauri from "@/lib/tauri";

vi.mock("@/lib/tauri", () => ({
  twitchAuthStart: vi.fn(),
  twitchAuthLogout: vi.fn(),
  twitchAuthStatus: vi.fn(),
  clearTwitchCache: vi.fn(),
  getTwitchDiagnostics: vi.fn(),
  twitchTestConnection: vi.fn(),
}));

describe("Story 19.10: Twitch Connection Settings", () => {
  beforeEach(() => {
    vi.mocked(tauri.twitchAuthStatus).mockResolvedValue({
      authenticated: false,
      displayName: null,
      expiresAt: null,
      profileImageUrl: null,
    });
    vi.mocked(tauri.twitchAuthStart).mockResolvedValue(undefined);
    vi.mocked(tauri.twitchAuthLogout).mockResolvedValue(undefined);
    vi.mocked(tauri.clearTwitchCache).mockResolvedValue(undefined);
    useSettingsStore.setState({
      twitchEnabled: true,
      twitchRefreshInterval: 60,
      twitchNotificationsEnabled: true,
      twitchNotificationsFavoritesOnly: false,
    });
    useTwitchStore.setState({
      isAuthenticated: false,
      channels: [],
    });
  });

  it("disconnected state shows connect button", () => {
    render(<TwitchSettings />);
    expect(screen.getByText("Not connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect with twitch/i })).toBeInTheDocument();
  });

  it("connected state shows avatar from auth status (not from followed channels), name, Connected badge, and disconnect button", async () => {
    vi.mocked(tauri.twitchAuthStatus).mockResolvedValue({
      authenticated: true,
      displayName: "TestUser",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      profileImageUrl: "https://example.com/me.png",
    });
    // Followed-channel avatar is intentionally a different URL: the avatar must come
    // from the logged-in user's profile (auth status), not the first followed channel.
    useTwitchStore.setState({
      isAuthenticated: true,
      channels: [
        {
          id: "1",
          login: "someone-else",
          displayName: "SomeoneElse",
          profileImageUrl: "https://example.com/someone-else.png",
          isLive: false,
          stream: null,
          isFavorite: false,
        },
      ],
    });
    render(<TwitchSettings />);
    expect(await screen.findByText("TestUser")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /disconnect twitch/i })).toBeInTheDocument();
    const img = document.querySelector('img[alt=""]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "https://example.com/me.png");
  });

  it("shows initial-letter placeholder when auth status has no profile image (legacy users)", async () => {
    vi.mocked(tauri.twitchAuthStatus).mockResolvedValue({
      authenticated: true,
      displayName: "Legacy",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      profileImageUrl: null,
    });
    useTwitchStore.setState({
      isAuthenticated: true,
      channels: [
        {
          id: "1",
          login: "channel-with-image",
          displayName: "Channel",
          profileImageUrl: "https://example.com/should-not-show.png",
          isLive: false,
          stream: null,
          isFavorite: false,
        },
      ],
    });
    render(<TwitchSettings />);
    expect(await screen.findByText("Legacy")).toBeInTheDocument();
    // No <img>: backend has no avatar yet for this legacy account, so we render the
    // initial-letter placeholder instead of falling back to a follow channel's image.
    expect(document.querySelector("img")).toBeNull();
  });

  it("disconnect button opens confirmation dialog", async () => {
    useTwitchStore.setState({
      isAuthenticated: true,
      channels: [{ id: "1", login: "u", displayName: "User", profileImageUrl: "", isLive: false, stream: null }],
    });
    render(<TwitchSettings />);
    fireEvent.click(screen.getByRole("button", { name: /disconnect twitch/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/disconnect twitch\?/i)).toBeInTheDocument();
    expect(screen.getByText(/stop receiving live stream updates/i)).toBeInTheDocument();
  });

  it("refresh interval dropdown updates setting", () => {
    render(<TwitchSettings />);
    const select = screen.getByTestId("twitch-refresh-interval");
    expect(select).toHaveValue("60");
    fireEvent.change(select, { target: { value: "120" } });
    expect(useSettingsStore.getState().twitchRefreshInterval).toBe(120);
  });

  it("notification toggles update settings", () => {
    render(<TwitchSettings />);
    const notificationsCheckbox = screen.getByTestId("twitch-notifications-enabled");
    expect(notificationsCheckbox).toBeChecked();
    fireEvent.click(notificationsCheckbox);
    expect(useSettingsStore.getState().twitchNotificationsEnabled).toBe(false);
    fireEvent.click(notificationsCheckbox);
    expect(useSettingsStore.getState().twitchNotificationsEnabled).toBe(true);

    const favoritesOnlyCheckbox = screen.getByTestId("twitch-notifications-favorites-only");
    expect(favoritesOnlyCheckbox).not.toBeChecked();
    fireEvent.click(favoritesOnlyCheckbox);
    expect(useSettingsStore.getState().twitchNotificationsFavoritesOnly).toBe(true);
  });

  it("favorites only toggle is visible and enabled when notifications are on", () => {
    render(<TwitchSettings />);
    expect(screen.getByTestId("twitch-notifications-favorites-only")).toBeInTheDocument();
    expect(screen.getByTestId("twitch-notifications-favorites-only")).not.toBeDisabled();
  });

  it("feature toggle (Show Twitch in sidebar) opens confirmation when disabling", () => {
    render(<TwitchSettings />);
    const featureToggle = screen.getByTestId("twitch-enabled");
    expect(featureToggle).toBeChecked();
    fireEvent.click(featureToggle);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/disable twitch integration\?/i)).toBeInTheDocument();
  });

  it("clear cache button invokes clear_twitch_cache", async () => {
    render(<TwitchSettings />);
    fireEvent.click(screen.getByRole("button", { name: /clear twitch cached data/i }));
    expect(tauri.clearTwitchCache).toHaveBeenCalled();
  });

  it("section has Twitch Integration heading and Twitch icon", () => {
    render(<TwitchSettings />);
    expect(screen.getByRole("heading", { name: /twitch integration/i })).toBeInTheDocument();
    expect(screen.getByTestId("twitch-settings")).toBeInTheDocument();
  });

  it("diagnostics panel is collapsed by default and does not poll on mount (Story D1)", () => {
    render(<TwitchSettings />);
    expect(screen.getByTestId("twitch-diagnostics-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("twitch-diagnostics-body")).not.toBeInTheDocument();
    expect(tauri.getTwitchDiagnostics).not.toHaveBeenCalled();
  });

  it("expanding diagnostics fetches and renders snapshot fields (Story D1)", async () => {
    vi.mocked(tauri.getTwitchDiagnostics).mockResolvedValue({
      tokenAuthenticated: true,
      tokenExpiresAt: 1_700_000_000,
      tokenExpiresInSecs: 3600,
      lastRefreshAt: 1_699_900_000,
      lastRefreshError: null,
      displayName: "Streamer",
      userId: "123",
      rateLimit: {
        tokensUsed: 7,
        tokensRemaining: 793,
        windowResetAt: 1_700_000_060,
        windowSecs: 60,
        cap: 800,
      },
      eventsubConnected: true,
      eventsubSessionId: "SESS",
      eventsubSubscriptionCount: 42,
      lastEventAt: 1_699_999_900,
      nowSecs: 1_700_000_500,
    });

    render(<TwitchSettings />);
    fireEvent.click(screen.getByTestId("twitch-diagnostics-toggle"));

    expect(await screen.findByTestId("twitch-diagnostics-body")).toBeInTheDocument();
    expect(tauri.getTwitchDiagnostics).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("diag-eventsub-connected")).toHaveTextContent("yes");
    expect(screen.getByTestId("diag-rate-limit")).toHaveTextContent("7 / 800");
  });

  it("Test connection button surfaces success/latency (Story D1)", async () => {
    vi.mocked(tauri.getTwitchDiagnostics).mockResolvedValue({
      tokenAuthenticated: true,
      tokenExpiresAt: null,
      tokenExpiresInSecs: null,
      lastRefreshAt: null,
      lastRefreshError: null,
      displayName: null,
      userId: null,
      rateLimit: { tokensUsed: 0, tokensRemaining: 800, windowResetAt: 0, windowSecs: 60, cap: 800 },
      eventsubConnected: false,
      eventsubSessionId: null,
      eventsubSubscriptionCount: 0,
      lastEventAt: null,
      nowSecs: 0,
    });
    vi.mocked(tauri.twitchTestConnection).mockResolvedValue({
      ok: true,
      latencyMs: 91,
      error: null,
    });

    render(<TwitchSettings />);
    fireEvent.click(screen.getByTestId("twitch-diagnostics-toggle"));
    await screen.findByTestId("twitch-diagnostics-body");
    fireEvent.click(screen.getByTestId("twitch-test-connection"));

    const result = await screen.findByTestId("twitch-test-connection-result");
    expect(result).toHaveTextContent(/OK · 91 ms/);
  });
});
