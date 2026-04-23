import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppearanceSettings } from "@/components/Settings/AppearanceSettings";
import { useSettingsApplier } from "@/hooks/useSettingsApplier";
import { useSettingsStore } from "@/stores/settingsStore";

function ThemeHarness() {
  useSettingsApplier();
  return <AppearanceSettings />;
}

function mockMatchMedia(prefersDark: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const isColorSchemeDark = query === "(prefers-color-scheme: dark)";
    return {
      matches: isColorSchemeDark ? prefersDark : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
  });
}

describe("Appearance theme switcher", () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    document.documentElement.classList.remove("light", "dark");
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    localStorage.clear();
    matchMediaSpy = mockMatchMedia(true);
  });

  afterEach(() => {
    matchMediaSpy.mockRestore();
    document.documentElement.classList.remove("light", "dark");
  });

  it("applies light class when Light is selected", () => {
    render(<ThemeHarness />);
    fireEvent.click(screen.getByTestId("theme-light"));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applies dark class when Dark is selected", () => {
    render(<ThemeHarness />);
    fireEvent.click(screen.getByTestId("theme-dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("applies dark on document when System is selected and OS prefers dark", () => {
    render(<ThemeHarness />);
    fireEvent.click(screen.getByTestId("theme-system"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("applies light on document when System is selected and OS prefers light", () => {
    matchMediaSpy.mockRestore();
    matchMediaSpy = mockMatchMedia(false);
    render(<ThemeHarness />);
    fireEvent.click(screen.getByTestId("theme-system"));
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
