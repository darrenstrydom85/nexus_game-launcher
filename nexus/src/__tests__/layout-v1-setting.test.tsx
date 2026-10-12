import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { useSettingsStore } from "@/stores/settingsStore";
import { AppearanceSettings } from "@/components/Settings/AppearanceSettings";

describe("layoutV1 setting", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue(undefined);
    useSettingsStore.setState({ layoutV1: false });
  });

  it("persists to the backend when toggled", () => {
    useSettingsStore.getState().setLayoutV1(true);
    expect(useSettingsStore.getState().layoutV1).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("set_setting", { key: "layout_v1", value: "true" });
  });

  it("defaults to the new layout when nothing is saved, as after a reset", async () => {
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(cmd === "get_settings" ? {} : []));
    await useSettingsStore.getState().loadFromBackend();
    expect(useSettingsStore.getState().layoutV1).toBe(true);
  });

  it("keeps the classic layout when it was chosen", async () => {
    useSettingsStore.setState({ layoutV1: true });
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(cmd === "get_settings" ? { layout_v1: "false" } : []));
    await useSettingsStore.getState().loadFromBackend();
    expect(useSettingsStore.getState().layoutV1).toBe(false);
  });

  it("loads from the backend", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "get_settings" ? { layout_v1: "true" } : []),
    );
    await useSettingsStore.getState().loadFromBackend();
    expect(useSettingsStore.getState().layoutV1).toBe(true);
  });

  it("can be switched from Appearance settings", () => {
    render(<AppearanceSettings />);
    const toggle = screen.getByTestId("pref-layout-v1");
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    expect(useSettingsStore.getState().layoutV1).toBe(true);
  });
});
