import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(() => Promise.resolve("1.0.2")) }));

import { buildPayload, sendUsageCountIfDue, USAGE_COUNT_URL } from "@/lib/usageCount";
import { useSettingsStore } from "@/stores/settingsStore";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("buildPayload", () => {
  it("flags week and month by the UTC calendar", () => {
    expect(buildPayload("1.0.2", null, "2026-10-21")).toEqual({ version: "1.0.2", firstOpenThisWeek: true, firstOpenThisMonth: true });
    // Tue -> Wed, same week
    expect(buildPayload("1.0.2", "2026-10-20", "2026-10-21")).toMatchObject({ firstOpenThisWeek: false, firstOpenThisMonth: false });
    // Sun -> Mon, new week, same month
    expect(buildPayload("1.0.2", "2026-10-25", "2026-10-26")).toMatchObject({ firstOpenThisWeek: true, firstOpenThisMonth: false });
    // Wed Sep 30 -> Thu Oct 1, same week, new month
    expect(buildPayload("1.0.2", "2026-09-30", "2026-10-01")).toMatchObject({ firstOpenThisWeek: false, firstOpenThisMonth: true });
  });
});

describe("sendUsageCountIfDue", () => {
  const today = new Date("2026-10-21T08:00:00Z");

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue({ ok: true });
    useSettingsStore.setState({ usageCountEnabled: true, usageCountNoticeSeen: true, usageCountLastSent: null });
  });

  it("sends nothing until the notice is answered", async () => {
    useSettingsStore.setState({ usageCountNoticeSeen: false });
    await sendUsageCountIfDue(today);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when turned off", async () => {
    useSettingsStore.setState({ usageCountEnabled: false });
    await sendUsageCountIfDue(today);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends exactly the payload once a day and records it", async () => {
    await sendUsageCountIfDue(today);
    await sendUsageCountIfDue(new Date("2026-10-21T22:00:00Z"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(USAGE_COUNT_URL);
    expect(JSON.parse(init.body)).toEqual({ version: "1.0.2", firstOpenThisWeek: true, firstOpenThisMonth: true });
    expect(useSettingsStore.getState().usageCountLastSent?.sentAt).toBe(today.toISOString());
  });

  it("records nothing when the request fails, so the next open retries", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await sendUsageCountIfDue(today);
    expect(useSettingsStore.getState().usageCountLastSent).toBeNull();
    await sendUsageCountIfDue(today);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
