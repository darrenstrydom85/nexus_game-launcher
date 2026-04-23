import { describe, expect, it } from "vitest";
import {
  selectionToDateRange,
  type PeriodSelection,
} from "@/hooks/useWrapped";

/**
 * `selectionToDateRange` is the frontend mirror of the backend's
 * `resolve_period_to_range` and is what feeds the Twitch watch slide on
 * Wrapped. Locking down the date-range outputs keeps the slide in sync with
 * the rest of the report (which still goes through the Rust resolver).
 */
describe("selectionToDateRange", () => {
  // Mid-month so we exercise both "this_month" and "last_month" non-trivially,
  // plus a non-leap-year February for "last_month" → 2026-02 (28 days).
  const now = new Date("2026-04-15T12:00:00Z");

  it("year preset maps to Jan 1 - Dec 31 of the selected year", () => {
    const sel: PeriodSelection = { kind: "year", year: 2024 };
    const r = selectionToDateRange(sel, now);
    expect(r).toEqual({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      label: "2024",
    });
  });

  it("custom selection passes the dates through verbatim", () => {
    const sel: PeriodSelection = {
      kind: "custom",
      startDate: "2026-03-01",
      endDate: "2026-03-15",
    };
    const r = selectionToDateRange(sel, now);
    expect(r.startDate).toBe("2026-03-01");
    expect(r.endDate).toBe("2026-03-15");
    expect(r.label).toContain("2026-03-01");
    expect(r.label).toContain("2026-03-15");
  });

  it("'this_month' covers the full current month including the last day", () => {
    const sel: PeriodSelection = { kind: "preset", preset: "this_month" };
    const r = selectionToDateRange(sel, now);
    expect(r).toEqual({
      startDate: "2026-04-01",
      // April has 30 days
      endDate: "2026-04-30",
      label: "This month",
    });
  });

  it("'last_month' rolls back to March (and handles the day count)", () => {
    const sel: PeriodSelection = { kind: "preset", preset: "last_month" };
    const r = selectionToDateRange(sel, now);
    expect(r).toEqual({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      label: "Last month",
    });
  });

  it("'last_month' wraps year boundary in January", () => {
    const jan = new Date("2026-01-10T12:00:00Z");
    const sel: PeriodSelection = { kind: "preset", preset: "last_month" };
    const r = selectionToDateRange(sel, jan);
    expect(r.startDate).toBe("2025-12-01");
    expect(r.endDate).toBe("2025-12-31");
  });

  it("'last_month' handles a non-leap February (28 days)", () => {
    const mar = new Date("2026-03-15T12:00:00Z");
    const sel: PeriodSelection = { kind: "preset", preset: "last_month" };
    const r = selectionToDateRange(sel, mar);
    expect(r).toEqual({
      startDate: "2026-02-01",
      endDate: "2026-02-28",
      label: "Last month",
    });
  });

  it("'this_year' covers the full current calendar year", () => {
    const sel: PeriodSelection = { kind: "preset", preset: "this_year" };
    const r = selectionToDateRange(sel, now);
    expect(r).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-12-31",
      label: "This year",
    });
  });

  it("'last_year' covers the full previous calendar year", () => {
    const sel: PeriodSelection = { kind: "preset", preset: "last_year" };
    const r = selectionToDateRange(sel, now);
    expect(r).toEqual({
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      label: "Last year",
    });
  });

  it("'last_7_days' is an inclusive 7-day window ending today", () => {
    const sel: PeriodSelection = { kind: "preset", preset: "last_7_days" };
    const r = selectionToDateRange(sel, now);
    // 6 days back + today = 7 inclusive days
    expect(r).toEqual({
      startDate: "2026-04-09",
      endDate: "2026-04-15",
      label: "Last 7 days",
    });
  });

  it("'last_30_days' is an inclusive 30-day window ending today", () => {
    const sel: PeriodSelection = { kind: "preset", preset: "last_30_days" };
    const r = selectionToDateRange(sel, now);
    // 29 days back + today = 30 inclusive days
    expect(r).toEqual({
      startDate: "2026-03-17",
      endDate: "2026-04-15",
      label: "Last 30 days",
    });
  });
});
