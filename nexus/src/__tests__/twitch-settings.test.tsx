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
}));

describe("Story 19.10: Twitch Connection Settings", () => {
  beforeEach(() => {
    vi.mocked(tauri.twitchAuthStatus).mockResolvedValue({
      authenticated: false,
      displayName: null,
      expiresAt: null,
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

  it("connected state shows avatar, name, Connected badge, and disconnect button", async () => {
    vi.mocked(tauri.twitchAuthStatus).mockResolvedValue({
      authenticated: true,
      displayName: "TestUser",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    });
    useTwitchStore.setState({
      isAuthenticated: true,
      channels: [
        {
          id: "1",
          login: "user",
          displayName: "TestUser",
          profileImageUrl: "https://example.com/avatar.png",
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
    expect(img).toHaveAttribute("src", "https://example.com/avatar.png");
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
});
