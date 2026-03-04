import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TwitchPanel } from "@/components/Twitch/TwitchPanel";
import { LiveOnTwitch } from "@/components/GameDetail/LiveOnTwitch";
import { useConnectivityStore } from "@/stores/connectivityStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import * as tauri from "@/lib/tauri";

vi.mock("@/lib/tauri", async (importOriginal) => {
  const mod = await importOriginal<typeof tauri>();
  return {
    ...mod,
    checkConnectivity: vi.fn().mockResolvedValue({ online: true }),
    twitchAuthStatus: vi.fn().mockResolvedValue({ authenticated: false, displayName: null, expiresAt: null }),
  };
});

describe("Story 19.11: Offline resilience and connectivity", () => {
  beforeEach(() => {
    useConnectivityStore.setState({ isOnline: true });
    useSettingsStore.setState({ twitchEnabled: true });
    useTwitchStore.setState({
      isAuthenticated: false,
      channels: [],
      liveStreams: [],
      stale: false,
      cachedAt: null,
    });
  });

  it("offline indicator (WifiOff) shown in Twitch panel header when isOnline is false", () => {
    useConnectivityStore.setState({ isOnline: false });
    useTwitchStore.setState({
      isAuthenticated: true,
      channels: [{ id: "1", login: "u", displayName: "User", profileImageUrl: "", isLive: false, stream: null }],
      liveStreams: [],
      stale: true,
      cachedAt: Math.floor(Date.now() / 1000) - 60,
    });
    render(<TwitchPanel />);
    const offlineLabel = document.querySelector('[aria-label="Offline — showing cached data"]');
    expect(offlineLabel).toBeInTheDocument();
  });

  it("Live on Twitch section hidden when offline", () => {
    useConnectivityStore.setState({ isOnline: false });
    useTwitchStore.setState({ isAuthenticated: true });
    render(<LiveOnTwitch gameName="Test Game" />);
    expect(screen.queryByTestId("live-on-twitch-section")).not.toBeInTheDocument();
  });

  it("stale bar has role status and aria-live polite when data is stale", () => {
    useTwitchStore.setState({
      isAuthenticated: true,
      channels: [{ id: "1", login: "u", displayName: "User", profileImageUrl: "", isLive: false, stream: null }],
      liveStreams: [],
      stale: true,
      cachedAt: Math.floor(Date.now() / 1000) - 120,
    });
    render(<TwitchPanel />);
    const statusRegion = document.querySelector('[role="status"][aria-live="polite"]');
    expect(statusRegion).toBeInTheDocument();
    expect(statusRegion?.textContent).toMatch(/cached data/i);
  });
});
