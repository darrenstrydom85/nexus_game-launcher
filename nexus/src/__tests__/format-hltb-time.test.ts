import { describe, it, expect } from "vitest";
import { formatHltbTime, formatHltbDays } from "@/lib/utils";

describe("formatHltbTime", () => {
  it("returns em dash for null", () => {
    expect(formatHltbTime(null)).toBe("\u2014");
  });

  it("returns em dash for 0", () => {
    expect(formatHltbTime(0)).toBe("\u2014");
  });

  it("returns em dash for negative values", () => {
    expect(formatHltbTime(-5)).toBe("\u2014");
  });

  it("formats sub-hour as minutes", () => {
    expect(formatHltbTime(0.75)).toBe("45m");
  });

  it("formats exact 1 hour", () => {
    expect(formatHltbTime(1)).toBe("1h");
  });

  it("formats fractional hours as Xh Ym", () => {
    expect(formatHltbTime(2.5)).toBe("2h 30m");
  });

  it("formats exact whole hours", () => {
    expect(formatHltbTime(12)).toBe("12h");
  });

  it("formats 100+ hours without minutes", () => {
    expect(formatHltbTime(120)).toBe("120h");
  });

  it("formats 100+ fractional hours without minutes", () => {
    expect(formatHltbTime(105.7)).toBe("106h");
  });

  it("formats very small sub-hour values", () => {
    expect(formatHltbTime(0.25)).toBe("15m");
  });
});

describe("formatHltbDays", () => {
  it("returns null for null hours", () => {
    expect(formatHltbDays(null, 1.5)).toBeNull();
  });

  it("returns null for 0 hours", () => {
    expect(formatHltbDays(0, 1.5)).toBeNull();
  });

  it("returns null for negative hours", () => {
    expect(formatHltbDays(-5, 1.5)).toBeNull();
  });

  it("returns null when pace is zero or negative", () => {
    expect(formatHltbDays(12, 0)).toBeNull();
    expect(formatHltbDays(12, -1)).toBeNull();
  });

  it("returns null when pace is not finite", () => {
    expect(formatHltbDays(12, Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatHltbDays(12, Number.NaN)).toBeNull();
  });

  it("divides evenly at 1.5 h/day", () => {
    expect(formatHltbDays(12, 1.5)).toBe("~8 days");
    expect(formatHltbDays(45, 1.5)).toBe("~30 days");
  });

  it("rounds partial days up at 1.5 h/day", () => {
    expect(formatHltbDays(18.5, 1.5)).toBe("~13 days");
    expect(formatHltbDays(10, 1.5)).toBe("~7 days");
  });

  it("uses singular 'day' for one-day estimates", () => {
    expect(formatHltbDays(1, 1.5)).toBe("~1 day");
    expect(formatHltbDays(0.5, 1.5)).toBe("~1 day");
  });

  it("clamps sub-day estimates to at least one day", () => {
    expect(formatHltbDays(0.1, 1.5)).toBe("~1 day");
  });

  it("supports custom paces", () => {
    expect(formatHltbDays(40, 2)).toBe("~20 days");
    expect(formatHltbDays(40, 4)).toBe("~10 days");
  });
});
