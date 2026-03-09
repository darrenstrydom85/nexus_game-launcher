import { describe, it, expect } from "vitest";
import { formatHltbTime } from "@/lib/utils";

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
