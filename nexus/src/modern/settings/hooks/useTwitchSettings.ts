import * as React from "react";
import { useTwitchStore } from "@/stores/twitchStore";
import { useToastStore } from "@/stores/toastStore";
import {
  clearTwitchCache,
  getTwitchDiagnostics,
  twitchAuthLogout,
  twitchAuthStart,
  twitchAuthStatus,
  twitchTestConnection,
  type TwitchDiagnostics,
  type TwitchTestConnectionResult,
} from "@/lib/tauri";
import { errorMessage } from "./useApiKeys";

/** The signed-in Twitch account and the connect, disconnect and clear-cache actions. */
export function useTwitchAccount() {
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const setIsAuthenticated = useTwitchStore((s) => s.setIsAuthenticated);
  const fetchFollowedStreams = useTwitchStore((s) => s.fetchFollowedStreams);
  const fetchTrending = useTwitchStore((s) => s.fetchTrending);
  const addToast = useToastStore((s) => s.addToast);

  const [displayName, setDisplayName] = React.useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = React.useState<string | null>(null);
  const [connecting, setConnecting] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [clearingCache, setClearingCache] = React.useState(false);

  // Name and avatar come from auth status, not the followed channels.
  React.useEffect(() => {
    if (!isAuthenticated) {
      setDisplayName(null);
      setAvatarUrl(null);
      return;
    }
    let cancelled = false;
    twitchAuthStatus()
      .then((s) => {
        if (cancelled) return;
        setDisplayName(s.displayName ?? null);
        setAvatarUrl(s.profileImageUrl ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setDisplayName(null);
        setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const connect = React.useCallback(async () => {
    setConnecting(true);
    try {
      await twitchAuthStart();
      setIsAuthenticated(true);
      fetchFollowedStreams();
      fetchTrending();
    } catch {
      addToast({ type: "error", message: "Couldn’t connect to Twitch.", duration: 5000 });
    } finally {
      setConnecting(false);
    }
  }, [setIsAuthenticated, fetchFollowedStreams, fetchTrending, addToast]);

  /** Resolves true once signed out. */
  const disconnect = React.useCallback(async () => {
    setDisconnecting(true);
    try {
      await twitchAuthLogout();
      setIsAuthenticated(false);
      return true;
    } catch {
      addToast({ type: "error", message: "Couldn’t disconnect Twitch.", duration: 5000 });
      return false;
    } finally {
      setDisconnecting(false);
    }
  }, [setIsAuthenticated, addToast]);

  const clearCache = React.useCallback(async () => {
    setClearingCache(true);
    try {
      await clearTwitchCache();
      addToast({ type: "success", message: "Twitch cache cleared. Fresh data loads on the next refresh.", duration: 3000 });
    } catch {
      addToast({ type: "error", message: "Couldn’t clear the Twitch cache.", duration: 3000 });
    } finally {
      setClearingCache(false);
    }
  }, [addToast]);

  return { isAuthenticated, displayName, avatarUrl, connecting, disconnecting, clearingCache, connect, disconnect, clearCache };
}

const POLL_INTERVAL_MS = 5000;

/** Polls the Twitch diagnostics snapshot every 5s, only while `open`. */
export function useTwitchDiagnostics(open: boolean) {
  const [diag, setDiag] = React.useState<TwitchDiagnostics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [lastTest, setLastTest] = React.useState<TwitchTestConnectionResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const poll = () => {
      getTwitchDiagnostics()
        .then((d) => {
          if (cancelled) return;
          setDiag(d);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(e instanceof Error ? e.message : "Couldn’t load diagnostics");
        });
    };
    poll();
    const handle = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [open]);

  React.useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const testConnection = React.useCallback(async () => {
    setTesting(true);
    setLastTest(null);
    try {
      setLastTest(await twitchTestConnection());
    } catch (e) {
      setLastTest({ ok: false, latencyMs: 0, error: errorMessage(e) });
    } finally {
      setTesting(false);
    }
  }, []);

  const copy = React.useCallback(async () => {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setCopied(true);
    } catch {
      // best-effort: the clipboard API can fail in some webviews
    }
  }, [diag]);

  return { diag, error, testing, lastTest, copied, testConnection, copy };
}

export function fmtTimestamp(t: number | null): string {
  if (!t) return "—";
  return new Date(t * 1000).toLocaleString();
}

export function fmtDurationSecs(secs: number | null): string {
  if (secs == null) return "—";
  const sign = secs < 0 ? "-" : "";
  const abs = Math.abs(secs);
  if (abs < 60) return `${sign}${abs}s`;
  if (abs < 3600) return `${sign}${Math.floor(abs / 60)}m ${abs % 60}s`;
  return `${sign}${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m`;
}
