import { render, screen } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { FadeIn } from "@/components/motion/fade-in";

function mockMatchMedia(matches: boolean) {
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };
  vi.spyOn(window, "matchMedia").mockReturnValue(mql as unknown as MediaQueryList);
  return mql;
}

describe("FadeIn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children", () => {
    mockMatchMedia(false);
    render(
      <FadeIn>
        <span data-testid="child">Hello</span>
      </FadeIn>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies initial opacity style for animation", () => {
    mockMatchMedia(false);
    const { container } = render(
      <FadeIn>
        <span>Animated</span>
      </FadeIn>,
    );
    const motionDiv = container.firstElementChild as HTMLElement;
    expect(motionDiv).toBeTruthy();
    expect(motionDiv.tagName).toBe("DIV");
  });

  it("passes className to the motion wrapper", () => {
    mockMatchMedia(false);
    const { container } = render(
      <FadeIn className="custom-class">
        <span>Styled</span>
      </FadeIn>,
    );
    const motionDiv = container.firstElementChild as HTMLElement;
    expect(motionDiv.classList.contains("custom-class")).toBe(true);
  });

  it("renders without animation when reduced motion is preferred", () => {
    mockMatchMedia(true);
    render(
      <FadeIn>
        <span data-testid="reduced">No animation</span>
      </FadeIn>,
    );
    expect(screen.getByTestId("reduced")).toBeInTheDocument();
  });
});
