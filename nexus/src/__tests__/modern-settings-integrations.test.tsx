import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// The wizard button runs the real flow minus the page reload, which jsdom can't do.
const runSetupWizardSpy = vi.hoisted(() => vi.fn());
vi.mock("@/modern/settings/hooks/useApiKeys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/modern/settings/hooks/useApiKeys")>();
  runSetupWizardSpy.mockImplementation(() => actual.runSetupWizard(() => {}));
  return { ...actual, runSetupWizard: runSetupWizardSpy };
});

import { IntegrationsSection } from "@/modern/settings/sections/IntegrationsSection";
import { APIKeyManager } from "@/components/Settings/APIKeyManager";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useToastStore } from "@/stores/toastStore";

const EMPTY_KEYS = { steamGridDbKey: "", igdbClientId: "", igdbClientSecret: "" };
const SGDB_KEY = "1e53abcdef0123456789abcdef012a5c";

let responses: Record<string, unknown>;

function setSettingCalls() {
  return mockInvoke.mock.calls.filter(([cmd]) => cmd === "set_setting").map(([, args]) => args);
}

async function renderSection() {
  render(<IntegrationsSection />);
  // Let the auth-status effect settle.
  await act(async () => {});
}

describe("v1 Settings: Integrations", () => {
  beforeAll(() => {
    // Radix Select needs these in jsdom.
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
  });

  beforeEach(() => {
    responses = {
      verify_steamgrid_key: { valid: true, message: "SteamGridDB API key is valid" },
      verify_igdb_keys: { valid: true, message: "IGDB/Twitch credentials are valid" },
      twitch_auth_status: { authenticated: false, displayName: null, expiresAt: null, profileImageUrl: null },
    };
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(cmd in responses ? responses[cmd] : null));
    useSettingsStore.setState({
      apiKeys: { ...EMPTY_KEYS },
      twitchEnabled: true,
      twitchRefreshInterval: 60,
      twitchNotificationsEnabled: true,
      twitchNotificationsFavoritesOnly: false,
    });
    useTwitchStore.setState({ isAuthenticated: false });
  });

  describe("API keys", () => {
    it("adds a SteamGridDB key that was never set, persists it and checks it", async () => {
      await renderSection();
      expect(screen.getByTestId("steamgrid-status")).toHaveTextContent("Not set");

      fireEvent.click(screen.getByRole("button", { name: "Add SteamGridDB key" }));
      const input = screen.getByRole("textbox", { name: "SteamGridDB API key" });
      expect(input).toHaveFocus();
      expect(screen.getByTestId("steamgrid-save")).toBeDisabled();

      fireEvent.change(input, { target: { value: `  ${SGDB_KEY}\n` } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("steamgrid-save"));
      });

      // One write: the store is updated without writing the key a second time.
      expect(setSettingCalls()).toEqual([{ key: "steamgrid_api_key", value: SGDB_KEY }]);
      expect(mockInvoke).toHaveBeenCalledWith("verify_steamgrid_key");
      expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe(SGDB_KEY);
      expect(screen.getByTestId("steamgrid-masked")).toHaveTextContent("1e53 •••••••••••• 2a5c");
      expect(screen.getByTestId("steamgrid-status")).toHaveTextContent("Configured");
      // Focus returns to the row's Edit button.
      expect(screen.getByRole("button", { name: "Edit SteamGridDB key" })).toHaveFocus();
    });

    it("adds IGDB credentials together and needs both", async () => {
      await renderSection();
      fireEvent.click(screen.getByRole("button", { name: "Add IGDB keys" }));
      fireEvent.change(screen.getByRole("textbox", { name: "IGDB client ID" }), { target: { value: "client-id-1234" } });
      expect(screen.getByTestId("igdb-save")).toBeDisabled();
      fireEvent.change(screen.getByRole("textbox", { name: "IGDB client secret" }), { target: { value: "secret-abcd-9876" } });

      await act(async () => {
        fireEvent.submit(screen.getByRole("textbox", { name: "IGDB client secret" }).closest("form")!);
      });

      expect(setSettingCalls()).toEqual(
        expect.arrayContaining([
          { key: "igdb_client_id", value: "client-id-1234" },
          { key: "igdb_client_secret", value: "secret-abcd-9876" },
        ]),
      );
      expect(useSettingsStore.getState().apiKeys).toMatchObject({ igdbClientId: "client-id-1234", igdbClientSecret: "secret-abcd-9876" });
      expect(screen.getByTestId("igdb-status")).toHaveTextContent("Configured");
    });

    it("flags a key the provider rejects", async () => {
      responses.verify_steamgrid_key = { valid: false, message: "SteamGridDB API key is invalid or expired" };
      await renderSection();
      fireEvent.click(screen.getByTestId("steamgrid-add"));
      fireEvent.change(screen.getByTestId("steamgrid-input"), { target: { value: SGDB_KEY } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("steamgrid-save"));
      });
      expect(screen.getByTestId("steamgrid-status")).toHaveTextContent("Rejected");
      expect(screen.getByTestId("steamgrid-key-row")).toHaveTextContent("SteamGridDB API key is invalid or expired");
    });

    it("keeps the editor open when the save fails", async () => {
      mockInvoke.mockImplementation((cmd: string) => (cmd === "set_setting" ? Promise.reject("database is locked") : Promise.resolve(null)));
      await renderSection();
      fireEvent.click(screen.getByTestId("steamgrid-add"));
      fireEvent.change(screen.getByTestId("steamgrid-input"), { target: { value: SGDB_KEY } });
      await act(async () => {
        fireEvent.click(screen.getByTestId("steamgrid-save"));
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save: database is locked");
      expect(screen.getByTestId("steamgrid-input")).toBeInTheDocument();
      expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe("");
    });

    it("masks keys until revealed, and Escape cancels an edit", async () => {
      useSettingsStore.setState({ apiKeys: { ...EMPTY_KEYS, steamGridDbKey: SGDB_KEY } });
      await renderSection();
      expect(screen.getByTestId("steamgrid-masked")).not.toHaveTextContent(SGDB_KEY);

      const reveal = screen.getByRole("button", { name: "Show SteamGridDB key" });
      fireEvent.click(reveal);
      expect(reveal).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByTestId("steamgrid-masked")).toHaveTextContent(SGDB_KEY);

      fireEvent.click(screen.getByTestId("steamgrid-edit"));
      const input = screen.getByTestId("steamgrid-input");
      expect(input).toHaveValue(SGDB_KEY);
      fireEvent.change(input, { target: { value: "something-else" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(screen.queryByTestId("steamgrid-input")).not.toBeInTheDocument();
      expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe(SGDB_KEY);
    });

    it("asks before removing a key", async () => {
      useSettingsStore.setState({ apiKeys: { ...EMPTY_KEYS, steamGridDbKey: SGDB_KEY } });
      await renderSection();

      fireEvent.click(screen.getByRole("button", { name: "Remove SteamGridDB key" }));
      const dialog = screen.getByRole("alertdialog");
      expect(within(dialog).getByText("Remove SteamGridDB key?")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByTestId("confirm-cancel"));
      expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe(SGDB_KEY);

      fireEvent.click(screen.getByRole("button", { name: "Remove SteamGridDB key" }));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByTestId("confirm-action"));
      await waitFor(() => expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe(""));
      expect(setSettingCalls()).toEqual([{ key: "steamgrid_api_key", value: "" }]);
      expect(screen.getByTestId("steamgrid-status")).toHaveTextContent("Not set");
    });

    it("keeps the key when removing it fails", async () => {
      useToastStore.setState({ toasts: [] });
      useSettingsStore.setState({ apiKeys: { ...EMPTY_KEYS, steamGridDbKey: SGDB_KEY } });
      await renderSection();
      mockInvoke.mockImplementation((cmd: string) => (cmd === "set_setting" ? Promise.reject("database is locked") : Promise.resolve(null)));

      fireEvent.click(screen.getByRole("button", { name: "Remove SteamGridDB key" }));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByTestId("confirm-action"));

      await waitFor(() =>
        expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Couldn’t remove your SteamGridDB key. Please try again." }),
      );
      expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe(SGDB_KEY);
      expect(screen.getByTestId("steamgrid-masked")).toBeInTheDocument();
    });

    it("re-runs the setup wizard", async () => {
      await renderSection();
      fireEvent.click(screen.getByTestId("run-setup-wizard"));
      expect(runSetupWizardSpy).toHaveBeenCalled();
      expect(setSettingCalls()).toContainEqual({ key: "onboarding_completed", value: "false" });
    });

    it("reloads for the wizard only after the write lands", async () => {
      const { runSetupWizard } = await vi.importActual<typeof import("@/modern/settings/hooks/useApiKeys")>("@/modern/settings/hooks/useApiKeys");
      let finishWrite!: () => void;
      mockInvoke.mockImplementation(() => new Promise<void>((resolve) => (finishWrite = resolve)));
      const reload = vi.fn();
      const done = runSetupWizard(reload);
      await Promise.resolve();
      expect(reload).not.toHaveBeenCalled();
      finishWrite();
      await done;
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("Twitch", () => {
    it("toggles call the store setters and persist", async () => {
      await renderSection();
      const notify = screen.getByRole("switch", { name: "Go-live notifications" });
      const favourites = screen.getByRole("switch", { name: "Favourites only" });

      fireEvent.click(favourites);
      expect(useSettingsStore.getState().twitchNotificationsFavoritesOnly).toBe(true);
      expect(setSettingCalls()).toContainEqual({ key: "twitch_notifications_favorites_only", value: "true" });

      fireEvent.click(notify);
      expect(useSettingsStore.getState().twitchNotificationsEnabled).toBe(false);
      expect(setSettingCalls()).toContainEqual({ key: "twitch_notifications_enabled", value: "false" });
      expect(favourites).toBeDisabled();
    });

    it("asks before turning Twitch off, and turns it back on directly", async () => {
      await renderSection();
      const tab = screen.getByRole("switch", { name: "Show Twitch tab" });
      fireEvent.click(tab);
      expect(useSettingsStore.getState().twitchEnabled).toBe(true);
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Turn off" }));
      expect(useSettingsStore.getState().twitchEnabled).toBe(false);

      fireEvent.click(tab);
      expect(useSettingsStore.getState().twitchEnabled).toBe(true);
    });

    it("changes the refresh interval", async () => {
      await renderSection();
      const trigger = screen.getByRole("combobox", { name: "Refresh interval" });
      expect(trigger).toHaveTextContent("Every minute");
      fireEvent.keyDown(trigger, { key: "Enter" });
      fireEvent.click(await screen.findByRole("option", { name: "Every 2 minutes" }));
      expect(useSettingsStore.getState().twitchRefreshInterval).toBe(120);
    });

    it("asks before disconnecting, then offers Connect", async () => {
      responses.twitch_auth_status = { authenticated: true, displayName: "TestUser", expiresAt: null, profileImageUrl: "https://example.com/me.png" };
      useTwitchStore.setState({ isAuthenticated: true });
      await renderSection();
      expect(screen.getByText("Connected as TestUser")).toBeInTheDocument();
      expect(document.querySelector('img[src="https://example.com/me.png"]')).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Disconnect Twitch" }));
      expect(within(screen.getByRole("alertdialog")).getByText("Disconnect Twitch?")).toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalledWith("twitch_auth_logout");

      await act(async () => {
        fireEvent.click(screen.getByTestId("confirm-action"));
      });
      expect(mockInvoke).toHaveBeenCalledWith("twitch_auth_logout");
      expect(useTwitchStore.getState().isAuthenticated).toBe(false);
      await waitFor(() => expect(screen.getByRole("button", { name: /connect twitch/i })).toHaveFocus());
    });

    it("asks before clearing the cache", async () => {
      await renderSection();
      fireEvent.click(screen.getByRole("button", { name: "Clear Twitch cached data" }));
      expect(mockInvoke).not.toHaveBeenCalledWith("clear_twitch_cache");
      await act(async () => {
        fireEvent.click(within(screen.getByRole("alertdialog")).getByTestId("confirm-action"));
      });
      expect(mockInvoke).toHaveBeenCalledWith("clear_twitch_cache");
    });

    it("loads diagnostics only once opened, and tests the connection", async () => {
      responses.get_twitch_diagnostics = {
        tokenAuthenticated: true,
        tokenExpiresAt: 1_700_000_000,
        tokenExpiresInSecs: 3600,
        lastRefreshAt: 1_699_900_000,
        lastRefreshError: null,
        displayName: "Streamer",
        userId: "123",
        rateLimit: { tokensUsed: 7, tokensRemaining: 793, windowResetAt: 1_700_000_060, windowSecs: 60, cap: 800 },
        eventsubConnected: true,
        eventsubSessionId: "SESS",
        eventsubSubscriptionCount: 42,
        lastEventAt: 1_699_999_900,
        nowSecs: 1_700_000_500,
      };
      responses.twitch_test_connection = { ok: true, latencyMs: 91, error: null };
      await renderSection();
      expect(screen.queryByTestId("twitch-diagnostics-body")).not.toBeInTheDocument();
      expect(mockInvoke).not.toHaveBeenCalledWith("get_twitch_diagnostics");

      const toggle = screen.getByTestId("twitch-diagnostics-toggle");
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await screen.findByTestId("diag-rate-limit")).toHaveTextContent("7 / 800");
      expect(screen.getByTestId("diag-eventsub-connected")).toHaveTextContent("Yes");

      await act(async () => {
        fireEvent.click(screen.getByTestId("twitch-test-connection"));
      });
      expect(screen.getByTestId("twitch-test-connection-result")).toHaveTextContent("Connected · 91 ms");
    });
  });
});

describe("API key bug fix (shared)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation(() => Promise.resolve(null));
    useSettingsStore.setState({ apiKeys: { ...EMPTY_KEYS } });
  });

  it("classic APIKeyManager can add a key that was never set", async () => {
    render(<APIKeyManager />);
    fireEvent.click(screen.getByTestId("steamgrid-add"));
    fireEvent.change(screen.getByTestId("steamgrid-input"), { target: { value: ` ${SGDB_KEY} ` } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgrid-save"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("set_setting", { key: "steamgrid_api_key", value: SGDB_KEY });
    expect(useSettingsStore.getState().apiKeys.steamGridDbKey).toBe(SGDB_KEY);
    expect(screen.getByTestId("steamgrid-status")).toHaveTextContent("Configured");
    // IGDB fields have their own add buttons too.
    expect(screen.getByTestId("igdb-id-add")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-secret-add")).toBeInTheDocument();
  });

  it("loads IGDB keys from the database even with no SteamGridDB key", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "get_settings" ? { igdb_client_id: "cid", igdb_client_secret: "csec" } : []),
    );
    await useSettingsStore.getState().loadFromBackend();
    expect(useSettingsStore.getState().apiKeys).toEqual({ steamGridDbKey: "", igdbClientId: "cid", igdbClientSecret: "csec" });
  });
});
