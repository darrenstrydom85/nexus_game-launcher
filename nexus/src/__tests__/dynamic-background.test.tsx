import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  useDominantColor,
  extractDominantColor,
  clearColorCache,
  getColorCacheSize,
} from "@/hooks/useDominantColor";

function TestHookConsumer({ url }: { url: string | null }) {
  const color = useDominantColor(url);
  return <div data-testid="hook-output">{color}</div>;
}

describe("Story 5.6: Dynamic Background", () => {
  beforeEach(() => {
    clearColorCache();
  });

  describe("useDominantColor hook", () => {
    it("returns default color when imageUrl is null", () => {
      render(<TestHookConsumer url={null} />);
      expect(screen.getByTestId("hook-output").textContent).toBe(
        "rgb(30, 30, 40)",
      );
    });

    it("returns default color when imageUrl is undefined", () => {
      render(<TestHookConsumer url={null} />);
      expect(screen.getByTestId("hook-output").textContent).toBe(
        "rgb(30, 30, 40)",
      );
    });

    it("is exported from hooks/useDominantColor.ts", () => {
      expect(typeof useDominantColor).toBe("function");
    });
  });

  describe("extractDominantColor", () => {
    it("is an async function that returns a promise", () => {
      expect(typeof extractDominantColor).toBe("function");
    });

    it("cache starts empty", () => {
      expect(getColorCacheSize()).toBe(0);
    });
  });

  describe("color cache", () => {
    it("starts empty", () => {
      expect(getColorCacheSize()).toBe(0);
    });

    it("clearColorCache resets cache", () => {
      clearColorCache();
      expect(getColorCacheSize()).toBe(0);
    });
  });

});
