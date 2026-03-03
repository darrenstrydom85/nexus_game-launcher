import { describe, it, expect } from "vitest";
import { formatHltbTime } from "@/lib/utils";

describe("formatHltbTime", () => {
  it("returns null for null input", () => {
    expect(formatHltbTime(null)).toBeNull();
  });

  it("returns null for 0 seconds", () => {
    expect(formatHltbTime(0)).toBeNull();
  });

  it("returns null for negative sentinel value -1", () => {
    expect(formatHltbTime(-1)).toBeNull();
  });

  it("formats sub-hour as minutes only", () => {
    expect(formatHltbTime(45 * 60)).toBe("45m");
  });

  it("formats exactly 1 minute", () => {
    expect(formatHltbTime(60)).toBe("1m");
  });

  it("formats 59 minutes", () => {
    expect(formatHltbTime(59 * 60)).toBe("59m");
  });

  it("formats exactly 1 hour with no minutes", () => {
    expect(formatHltbTime(60 * 60)).toBe("1h");
  });

  it("formats 1 hour 30 minutes", () => {
    expect(formatHltbTime(90 * 60)).toBe("1h 30m");
  });

  it("formats 2 hours exactly (omits minutes)", () => {
    expect(formatHltbTime(120 * 60)).toBe("2h");
  });

  it("formats 2 hours 15 minutes", () => {
    expect(formatHltbTime(135 * 60)).toBe("2h 15m");
  });

  it("formats 12 hours 30 minutes", () => {
    expect(formatHltbTime(12 * 3600 + 30 * 60)).toBe("12h 30m");
  });

  it("formats 12 hours exactly", () => {
    expect(formatHltbTime(12 * 3600)).toBe("12h");
  });

  it("formats >= 100 hours as hours only", () => {
    expect(formatHltbTime(120 * 3600)).toBe("120h");
  });

  it("formats exactly 100 hours as hours only", () => {
    expect(formatHltbTime(100 * 3600)).toBe("100h");
  });

  it("rounds to nearest minute", () => {
    // 90 seconds = 1.5 minutes → rounds to 2m
    expect(formatHltbTime(90)).toBe("2m");
  });
});
