import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "@/stores/settingsStore";

/**
 * Anonymous usage count. The first time Nexus opens each day (UTC), it sends
 * USAGE_COUNT_URL exactly one UsageCountPayload and nothing else. There is no
 * ID, so the server can count opens but can't tell one install from another.
 *
 * Nothing is sent until the user has answered the notice, or while it's off.
 * Server code: nexus-stats/src/index.js. Everything it stores: GET USAGE_COUNT_URL.
 */
export const USAGE_COUNT_URL = "https://stats.nexusgamelauncher.com/";
export const USAGE_COUNT_SOURCE_URL =
  "https://github.com/darrenstrydom85/nexus_game-launcher/blob/main/nexus/src/lib/usageCount.ts";

export interface UsageCountPayload {
  version: string;
  firstOpenThisWeek: boolean;
  firstOpenThisMonth: boolean;
}

/** The last request sent. Kept on this PC only, so Settings can show it. */
export interface UsageCountRecord {
  sentAt: string;
  payload: UsageCountPayload;
}

/** YYYY-MM-DD in UTC, the calendar the server counts in. */
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the UTC week containing `day`. Same as weekOf in nexus-stats. */
export function weekOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return utcDay(d);
}

export function buildPayload(version: string, lastDay: string | null, today: string): UsageCountPayload {
  return {
    version,
    firstOpenThisWeek: lastDay === null || weekOf(lastDay) !== weekOf(today),
    firstOpenThisMonth: lastDay === null || lastDay.slice(0, 7) !== today.slice(0, 7),
  };
}

let sending = false;

/** Sends today's count, unless it's off, the notice is unanswered, or it already went today. */
export async function sendUsageCountIfDue(now = new Date()): Promise<void> {
  const s = useSettingsStore.getState();
  if (sending || !s.usageCountEnabled || !s.usageCountNoticeSeen) return;
  const today = utcDay(now);
  const lastDay = s.usageCountLastSent ? s.usageCountLastSent.sentAt.slice(0, 10) : null;
  if (lastDay === today) return;

  sending = true;
  try {
    const payload = buildPayload(await getVersion(), lastDay, today);
    const res = await fetch(USAGE_COUNT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) s.setUsageCountLastSent({ sentAt: now.toISOString(), payload });
  } catch {
    // Offline or blocked: nothing is recorded, so the next open tries again.
  } finally {
    sending = false;
  }
}
