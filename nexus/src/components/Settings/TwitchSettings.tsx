import * as React from "react";
import { TwitchIcon } from "@/lib/source-icons/TwitchIcon";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useToastStore } from "@/stores/toastStore";
import {
  twitchAuthStart,
  twitchAuthLogout,
  clearTwitchCache,
  twitchAuthStatus,
} from "@/lib/tauri";
import { TwitchDiagnosticsPanel } from "./TwitchDiagnosticsPanel";

const REFRESH_OPTIONS = [
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 0, label: "Manual only" },
] as const;

export function TwitchSettings() {
  const connectButtonRef = React.useRef<HTMLButtonElement>(null);
  const [disconnectDialogOpen, setDisconnectDialogOpen] = React.useState(false);
  const [disableTwitchDialogOpen, setDisableTwitchDialogOpen] = React.useState(false);
  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [clearingCache, setClearingCache] = React.useState(false);

  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const setIsAuthenticated = useTwitchStore((s) => s.setIsAuthenticated);
  const fetchFollowedStreams = useTwitchStore((s) => s.fetchFollowedStreams);
  const fetchTrending = useTwitchStore((s) => s.fetchTrending);

  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const setTwitchEnabled = useSettingsStore((s) => s.setTwitchEnabled);
  const twitchRefreshInterval = useSettingsStore((s) => s.twitchRefreshInterval);
  const setTwitchRefreshInterval = useSettingsStore((s) => s.setTwitchRefreshInterval);
  const twitchNotificationsEnabled = useSettingsStore((s) => s.twitchNotificationsEnabled);
  const setTwitchNotificationsEnabled = useSettingsStore((s) => s.setTwitchNotificationsEnabled);
  const twitchNotificationsFavoritesOnly = useSettingsStore(
    (s) => s.twitchNotificationsFavoritesOnly,
  );
  const setTwitchNotificationsFavoritesOnly = useSettingsStore(
    (s) => s.setTwitchNotificationsFavoritesOnly,
  );

  const addToast = useToastStore((s) => s.addToast);

  // Logged-in user's display name and avatar from auth status. The backend
  // TwitchTokenManager exposes both via twitch_auth_status as soon as auth
  // completes; legacy users get the avatar backfilled by validate_twitch_token.
  React.useEffect(() => {
    if (!isAuthenticated) {
      setDisplayName(null);
      setProfileImageUrl(null);
      return;
    }
    twitchAuthStatus()
      .then((s) => {
        setDisplayName(s.displayName ?? null);
        setProfileImageUrl(s.profileImageUrl ?? null);
      })
      .catch(() => {
        setDisplayName(null);
        setProfileImageUrl(null);
      });
  }, [isAuthenticated]);

  const avatarUrl = profileImageUrl;
  const nameLabel = displayName ?? "Connected";

  const handleConnect = React.useCallback(async () => {
    setConnecting(true);
    try {
      await twitchAuthStart();
      setIsAuthenticated(true);
      fetchFollowedStreams();
      fetchTrending();
    } catch {
      addToast({ type: "error", message: "Failed to connect to Twitch.", duration: 5000 });
    } finally {
      setConnecting(false);
    }
  }, [setIsAuthenticated, fetchFollowedStreams, fetchTrending, addToast]);

  const handleDisconnectConfirm = React.useCallback(async () => {
    setDisconnecting(true);
    try {
      await twitchAuthLogout();
      setIsAuthenticated(false);
      setDisconnectDialogOpen(false);
      setTimeout(() => connectButtonRef.current?.focus(), 100);
    } finally {
      setDisconnecting(false);
    }
  }, [setIsAuthenticated]);

  const handleDisableTwitchConfirm = React.useCallback(() => {
    setTwitchEnabled(false);
    setDisableTwitchDialogOpen(false);
  }, [setTwitchEnabled]);

  const handleClearCache = React.useCallback(async () => {
    setClearingCache(true);
    try {
      await clearTwitchCache();
      addToast({
        type: "success",
        message: "Twitch cache cleared. Fresh data will load on next refresh.",
        duration: 3000,
      });
    } catch {
      addToast({ type: "error", message: "Failed to clear cache.", duration: 3000 });
    } finally {
      setClearingCache(false);
    }
  }, [addToast]);

  return (
    <section data-testid="twitch-settings" aria-labelledby="twitch-settings-heading">
      <h3
        id="twitch-settings-heading"
        className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"
      >
        <TwitchIcon className="size-4 shrink-0" aria-hidden />
        Twitch Integration
      </h3>

      <div className="flex flex-col gap-4">
        {/* Connection */}
        <div className="flex flex-col gap-2">
          <span className="text-sm text-foreground">Connection</span>
          {isAuthenticated ? (
            <div className="flex flex-wrap items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="size-8 rounded-full object-cover"
                  width={32}
                  height={32}
                />
              ) : (
                <div
                  className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
                  aria-hidden
                >
                  {nameLabel.slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-foreground">{nameLabel}</span>
              <span
                className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-500"
                aria-hidden
              >
                Connected
              </span>
              <Button
                type="button"
                variant="outline"
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={() => setDisconnectDialogOpen(true)}
                aria-label="Disconnect Twitch"
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-muted-foreground">Not connected</span>
              <Button
                ref={connectButtonRef}
                type="button"
                onClick={handleConnect}
                disabled={connecting}
                aria-label="Connect with Twitch"
                aria-busy={connecting}
              >
                Connect with Twitch
              </Button>
            </div>
          )}
        </div>

        {/* Refresh interval */}
        <div>
          <label htmlFor="twitch-refresh-interval" className="mb-1 block text-sm text-foreground">
            Refresh interval
          </label>
          <select
            id="twitch-refresh-interval"
            data-testid="twitch-refresh-interval"
            aria-label="How often Nexus checks for live streams"
            className="rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground"
            value={twitchRefreshInterval}
            onChange={(e) => setTwitchRefreshInterval(Number(e.target.value))}
          >
            {REFRESH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            How often Nexus checks for live streams
          </p>
        </div>

        {/* Notifications */}
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-sm text-foreground">Go-live notifications</span>
            <input
              type="checkbox"
              role="switch"
              data-testid="twitch-notifications-enabled"
              aria-label="Show a notification when a followed streamer goes live"
              checked={twitchNotificationsEnabled}
              onChange={() => setTwitchNotificationsEnabled(!twitchNotificationsEnabled)}
              className="size-4 rounded border-border"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Show a notification when a followed streamer goes live
          </p>
          {twitchNotificationsEnabled && (
            <div className="pl-4">
              <label className="flex cursor-pointer items-center justify-between gap-2">
                <span className="text-sm text-foreground">Favorites only</span>
                <input
                  type="checkbox"
                  role="switch"
                  data-testid="twitch-notifications-favorites-only"
                  aria-label="Only notify for favorited streamers"
                  checked={twitchNotificationsFavoritesOnly}
                  onChange={() =>
                    setTwitchNotificationsFavoritesOnly(!twitchNotificationsFavoritesOnly)
                  }
                  className="size-4 rounded border-border"
                />
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Only notify for favorited streamers
              </p>
            </div>
          )}
        </div>

        {/* Feature toggle */}
        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-center justify-between gap-2">
            <span className="text-sm text-foreground">Show Twitch in sidebar</span>
            <input
              type="checkbox"
              role="switch"
              data-testid="twitch-enabled"
              aria-label="Hide the Twitch section from the sidebar and disable all Twitch features"
              checked={twitchEnabled}
              onChange={(e) => {
                if (e.target.checked) {
                  setTwitchEnabled(true);
                } else {
                  setDisableTwitchDialogOpen(true);
                }
              }}
              className="size-4 rounded border-border"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Hide the Twitch section from the sidebar and disable all Twitch features
          </p>
        </div>

        {/* Clear cache */}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleClearCache}
            disabled={clearingCache}
            data-testid="twitch-clear-cache"
            aria-label="Clear Twitch cached data"
          >
            Clear cache
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Remove cached streamer data. Fresh data will be fetched on next refresh.
          </p>
        </div>

        {/* Diagnostics (Story D1) */}
        <TwitchDiagnosticsPanel />
      </div>

      {/* Disconnect confirmation */}
      {disconnectDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disconnect-dialog-title"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
            onKeyDown={(e) => {
              if (e.key === "Escape") setDisconnectDialogOpen(false);
            }}
          >
            <h4 id="disconnect-dialog-title" className="text-sm font-semibold text-foreground">
              Disconnect Twitch?
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              You&apos;ll stop receiving live stream updates and notifications.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisconnectDialogOpen(false)}
                aria-label="Cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={handleDisconnectConfirm}
                disabled={disconnecting}
                aria-label="Disconnect"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Disable Twitch confirmation */}
      {disableTwitchDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="disable-twitch-dialog-title"
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
            onKeyDown={(e) => {
              if (e.key === "Escape") setDisableTwitchDialogOpen(false);
            }}
          >
            <h4 id="disable-twitch-dialog-title" className="text-sm font-semibold text-foreground">
              Disable Twitch integration?
            </h4>
            <p className="mt-2 text-sm text-muted-foreground">
              This will hide all Twitch features. Your connection will be preserved.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDisableTwitchDialogOpen(false)}
                aria-label="Cancel"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleDisableTwitchConfirm}
                aria-label="Disable"
              >
                Disable
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
