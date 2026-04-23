import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  getTwitchDiagnostics,
  twitchTestConnection,
  type TwitchDiagnostics,
  type TwitchTestConnectionResult,
} from "@/lib/tauri";

const POLL_INTERVAL_MS = 5000;

function fmtTimestamp(t: number | null): string {
  if (!t) return "—";
  return new Date(t * 1000).toLocaleString();
}

function fmtDurationSecs(secs: number | null): string {
  if (secs == null) return "—";
  const sign = secs < 0 ? "-" : "";
  const abs = Math.abs(secs);
  if (abs < 60) return `${sign}${abs}s`;
  if (abs < 3600) return `${sign}${Math.floor(abs / 60)}m ${abs % 60}s`;
  return `${sign}${Math.floor(abs / 3600)}h ${Math.floor((abs % 3600) / 60)}m`;
}

interface DiagRowProps {
  label: string;
  value: React.ReactNode;
  testId?: string;
}
function Row({ label, value, testId }: DiagRowProps) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b border-border/50 py-1.5 last:border-b-0"
      data-testid={testId}
    >
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-mono text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Twitch diagnostics collapsible (Story D1).
 *
 * Renders nothing until the user opens it (cheap default). Once open it polls
 * `get_twitch_diagnostics` every 5s — that command is intentionally O(few atomic
 * loads) so polling is fine.
 */
export function TwitchDiagnosticsPanel() {
  const [open, setOpen] = React.useState(false);
  const [diag, setDiag] = React.useState<TwitchDiagnostics | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [testing, setTesting] = React.useState(false);
  const [lastTest, setLastTest] = React.useState<TwitchTestConnectionResult | null>(
    null,
  );
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
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Failed to load diagnostics");
        });
    };
    poll();
    const handle = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [open]);

  const handleTest = async () => {
    setTesting(true);
    setLastTest(null);
    try {
      const res = await twitchTestConnection();
      setLastTest(res);
    } catch (e) {
      setLastTest({
        ok: false,
        latencyMs: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopy = async () => {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // best-effort: clipboard API can fail in some webviews
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={open}
        aria-controls="twitch-diagnostics-body"
        data-testid="twitch-diagnostics-toggle"
      >
        <span>Diagnostics</span>
        <span className="text-xs text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div
          id="twitch-diagnostics-body"
          className="px-3 pb-3"
          data-testid="twitch-diagnostics-body"
        >
          {error && (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}

          {diag ? (
            <dl className="mb-3">
              <Row
                label="Authenticated"
                value={diag.tokenAuthenticated ? "yes" : "no"}
                testId="diag-authenticated"
              />
              <Row label="User" value={diag.displayName ?? "—"} />
              <Row
                label="Token expires in"
                value={fmtDurationSecs(diag.tokenExpiresInSecs)}
                testId="diag-expires-in"
              />
              <Row label="Token expires at" value={fmtTimestamp(diag.tokenExpiresAt)} />
              <Row
                label="Last refresh"
                value={fmtTimestamp(diag.lastRefreshAt)}
                testId="diag-last-refresh"
              />
              {diag.lastRefreshError && (
                <Row
                  label="Last refresh error"
                  value={
                    <span className="text-destructive" title={diag.lastRefreshError}>
                      {diag.lastRefreshError.length > 60
                        ? diag.lastRefreshError.slice(0, 60) + "…"
                        : diag.lastRefreshError}
                    </span>
                  }
                />
              )}
              <Row
                label="Rate limit (used / cap)"
                value={`${diag.rateLimit.tokensUsed} / ${diag.rateLimit.cap}`}
                testId="diag-rate-limit"
              />
              <Row
                label="Rate-limit window resets"
                value={fmtTimestamp(diag.rateLimit.windowResetAt || null)}
              />
              <Row
                label="EventSub connected"
                value={diag.eventsubConnected ? "yes" : "no"}
                testId="diag-eventsub-connected"
              />
              <Row
                label="EventSub session"
                value={diag.eventsubSessionId ?? "—"}
              />
              <Row
                label="EventSub subscriptions"
                value={String(diag.eventsubSubscriptionCount)}
              />
              <Row label="Last event" value={fmtTimestamp(diag.lastEventAt)} />
            </dl>
          ) : (
            <p className="mb-3 text-xs text-muted-foreground">Loading…</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              disabled={testing}
              data-testid="twitch-test-connection"
              aria-label="Test Twitch connection"
            >
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleCopy}
              disabled={!diag}
              data-testid="twitch-diagnostics-copy"
              aria-label="Copy diagnostics to clipboard"
            >
              {copied ? "Copied!" : "Copy diagnostics"}
            </Button>
            {lastTest && (
              <span
                className={`text-xs ${lastTest.ok ? "text-emerald-500" : "text-destructive"}`}
                role="status"
                data-testid="twitch-test-connection-result"
              >
                {lastTest.ok
                  ? `OK · ${lastTest.latencyMs} ms`
                  : `Failed: ${lastTest.error ?? "unknown"}`}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
