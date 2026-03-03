import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, afterEach, vi } from "vitest";
import { AnimatePresenceToggle } from "@/components/motion/animate-presence-toggle";

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

describe("AnimatePresenceToggle", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the box on initial mount", () => {
    mockMatchMedia(false);
    render(<AnimatePresenceToggle />);
    expect(screen.getByTestId("presence-box")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide" })).toBeInTheDocument();
  });

  it("hides the box when toggle is clicked", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<AnimatePresenceToggle />);

    await user.click(screen.getByRole("button", { name: "Hide" }));

    await waitFor(() => {
      expect(screen.queryByTestId("presence-box")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Show" })).toBeInTheDocument();
  });

  it("shows the box again when toggled back", async () => {
    mockMatchMedia(false);
    const user = userEvent.setup();
    render(<AnimatePresenceToggle />);

    await user.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => {
      expect(screen.queryByTestId("presence-box")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Show" }));
    await waitFor(() => {
      expect(screen.getByTestId("presence-box")).toBeInTheDocument();
    });
  });

  it("works with reduced motion enabled", async () => {
    mockMatchMedia(true);
    const user = userEvent.setup();
    render(<AnimatePresenceToggle />);

    expect(screen.getByTestId("presence-box")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => {
      expect(screen.queryByTestId("presence-box")).not.toBeInTheDocument();
    });
  });
});
