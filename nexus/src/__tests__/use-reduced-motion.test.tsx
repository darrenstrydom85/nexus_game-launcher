import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useReducedMotion as motionUseReducedMotion } from "motion/react";

describe("useReducedMotion", () => {
  it("re-exports the hook from motion/react", () => {
    expect(useReducedMotion).toBe(motionUseReducedMotion);
  });

  it("returns a boolean value", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(typeof result.current).toBe("boolean");
  });

  it("returns false in jsdom (no OS reduced-motion preference)", () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });
});
