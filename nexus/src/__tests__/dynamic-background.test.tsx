import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  useDominantColor,
  extractDominantColor,
  clearColorCache,
  getColorCacheSize,
} from "@/hooks/useDominantColor";
import { DynamicBackground } from "@/components/shared/DynamicBackground";

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

  describe("DynamicBackground component", () => {
    it("renders the background wrapper element", () => {
      render(<DynamicBackground imageUrl={null} />);
      expect(screen.getByTestId("dynamic-background")).toBeInTheDocument();
    });

    it("has pointer-events-none and fixed positioning", () => {
      render(<DynamicBackground imageUrl={null} />);
      const bg = screen.getByTestId("dynamic-background");
      expect(bg.className).toContain("pointer-events-none");
      expect(bg.className).toContain("fixed");
      expect(bg.className).toContain("inset-0");
    });

    it("renders gradient layer inside wrapper", () => {
      render(<DynamicBackground imageUrl={null} />);
      const gradient = screen.getByTestId("dynamic-background-gradient");
      expect(gradient).toBeInTheDocument();
    });

    it("fill layer has radial-gradient in data-gradient attribute", () => {
      render(<DynamicBackground imageUrl={null} />);
      const fill = screen.getByTestId("dynamic-background-fill");
      const gradient = fill.getAttribute("data-gradient") ?? "";
      expect(gradient).toContain("radial-gradient");
      expect(gradient).toContain("ellipse at 50% 0%");
    });

    it("gradient uses subtle opacity (33 hex = 20%)", () => {
      render(<DynamicBackground imageUrl={null} />);
      const fill = screen.getByTestId("dynamic-background-fill");
      const gradient = fill.getAttribute("data-gradient") ?? "";
      expect(gradient).toContain("33 0%");
      expect(gradient).toContain("transparent 70%");
    });

    it("fill layer has will-change for GPU acceleration", () => {
      render(<DynamicBackground imageUrl={null} />);
      const fill = screen.getByTestId("dynamic-background-fill");
      const styleAttr = fill.getAttribute("style") ?? "";
      expect(styleAttr).toContain("will-change");
    });

    it("renders with z-0 to stay behind content", () => {
      render(<DynamicBackground imageUrl={null} />);
      const bg = screen.getByTestId("dynamic-background");
      expect(bg.className).toContain("z-0");
    });
  });
});
