/**
 * Relative time and duration formatting for UI (e.g. "2 min ago", "Live for 2h 34m").
 * Used by Twitch panel and other features that show timestamps.
 */

/**
 * Format a past timestamp as relative time (e.g. "2 min ago", "1h ago").
 * @param cachedAt - Unix seconds (from backend) or ISO string
 */
export function formatRelativeTime(cachedAt: number | string | null): string {
  if (cachedAt == null) return "";
  const secs =
    typeof cachedAt === "string"
      ? Math.floor(new Date(cachedAt).getTime() / 1000)
      : cachedAt;
  const now = Math.floor(Date.now() / 1000);
  const diff = now - secs;
  if (diff < 60) return "just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `${m} min ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return `${h}h ago`;
  }
  const d = Math.floor(diff / 86400);
  return `${d}d ago`;
}

/**
 * Format a duration in seconds as "Xh Ym" (e.g. "2h 34m", "45m").
 * Used for stream uptime ("Live for 2h 34m").
 */
export function formatDuration(seconds: number): string {
  if (seconds < 0 || !Number.isFinite(seconds)) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/**
 * Seconds between started_at (ISO string) and now.
 */
export function uptimeSeconds(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 1000));
}
