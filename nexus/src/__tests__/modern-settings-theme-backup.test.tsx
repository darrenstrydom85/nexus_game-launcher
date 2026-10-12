import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { ThemeSection } from "@/modern/settings/sections/ThemeSection";
import { BackupSection } from "@/modern/settings/sections/BackupSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { makeDefaultTheme, DEFAULT_FONT_SCALE, DEFAULT_RADIUS } from "@/lib/themeTypes";
import type { BackupStatus } from "@/lib/tauri";

async function renderTheme() {
  render(<ThemeSection />);
  // Let the installed-fonts lookup settle.
  await act(async () => {});
}

describe("v1 Settings › Theme Studio", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockInvoke.mockImplementation((cmd: string) => Promise.resolve(cmd === "list_system_fonts" ? ["Comic Neue"] : null));
    useSettingsStore.setState({ customTheme: null, accentColor: "#7600da", theme: "dark" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies a preset and keeps the user's fonts and shape", async () => {
    const mine = makeDefaultTheme("Mine");
    mine.fonts = { sans: "Inter", mono: "Fira Code" };
    mine.fontScale = 1.1;
    mine.radius = 0.5;
    useSettingsStore.setState({ customTheme: mine });
    await renderTheme();

    const dracula = screen.getByRole("button", { name: "Dracula" });
    expect(dracula).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(dracula);

    const theme = useSettingsStore.getState().customTheme;
    expect(theme?.name).toBe("Dracula");
    expect(theme?.colors.dark.background).toBe("#282a36");
    expect(theme?.fonts).toEqual({ sans: "Inter", mono: "Fira Code" });
    expect(theme?.fontScale).toBe(1.1);
    expect(theme?.radius).toBe(0.5);
    expect(dracula).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the stock look as Obsidian and offers a random theme", async () => {
    await renderTheme();
    expect(screen.getByRole("button", { name: "Obsidian" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Random" }));
    expect(useSettingsStore.getState().customTheme?.name).toBe("Random");
    expect(screen.getByRole("button", { name: "Random" })).toHaveAttribute("aria-pressed", "true");
  });

  it("snaps theme changes by switching transitions off for one frame", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    await renderTheme();
    const before = new Set(document.head.querySelectorAll("style[data-theme-snap]"));
    fireEvent.click(screen.getByRole("button", { name: "Nord" }));

    const style = [...document.head.querySelectorAll("style[data-theme-snap]")].find((el) => !before.has(el));
    expect(style?.textContent).toContain("transition:none!important");
    act(() => frames.forEach((cb) => cb(0)));
    expect(style?.isConnected).toBe(false);
  });

  it("choosing an accent swatch updates the theme and the saved accent", async () => {
    await renderTheme();
    const nexus = screen.getByRole("button", { name: "Accent Nexus purple" });
    expect(nexus).toHaveAttribute("aria-pressed", "true");

    const green = screen.getByRole("button", { name: "Accent Green" });
    fireEvent.click(green);

    const state = useSettingsStore.getState();
    expect(state.accentColor).toBe("#22c55e");
    expect(state.customTheme?.colors.dark.primary).toBe("#22c55e");
    expect(green).toHaveAttribute("aria-pressed", "true");
    expect(nexus).toHaveAttribute("aria-pressed", "false");
  });

  it("takes a custom accent as a hex code", async () => {
    await renderTheme();
    const field = screen.getByRole("textbox", { name: "Accent hex code" });
    fireEvent.change(field, { target: { value: "ff8800" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(useSettingsStore.getState().customTheme?.colors.dark.primary).toBe("#ff8800");
  });

  it("sliders change text size and corner radius, and the value resets them", async () => {
    await renderTheme();

    fireEvent.keyDown(screen.getByRole("slider", { name: "Text size" }), { key: "ArrowRight" });
    expect(useSettingsStore.getState().customTheme?.fontScale).toBeCloseTo(1.05);
    expect(screen.getByRole("button", { name: /^105%, reset text size to 100%/ })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("slider", { name: "Corner radius" }), { key: "ArrowLeft" });
    expect(useSettingsStore.getState().customTheme?.radius).toBeCloseTo(DEFAULT_RADIUS - 1 / 16);
    const radiusValue = screen.getByRole("button", { name: /^9px, reset corner radius/ });

    fireEvent.click(radiusValue);
    fireEvent.click(screen.getByRole("button", { name: /^105%, reset text size/ }));
    expect(useSettingsStore.getState().customTheme?.radius).toBe(DEFAULT_RADIUS);
    expect(useSettingsStore.getState().customTheme?.fontScale).toBe(DEFAULT_FONT_SCALE);
  });

  it("picks a UI font from the searchable list, including installed fonts", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    await renderTheme();

    fireEvent.click(screen.getByRole("combobox", { name: "UI font" }));
    expect(await screen.findByRole("option", { name: "Comic Neue" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Inter" }));

    expect(useSettingsStore.getState().customTheme?.fonts.sans).toBe("Inter");
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  it("reset goes back to the stock look", async () => {
    await renderTheme();
    const reset = screen.getByTestId("theme-reset");
    expect(reset).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Nord" }));
    fireEvent.click(reset);
    expect(useSettingsStore.getState().customTheme).toBeNull();
  });
});

const connected: BackupStatus = {
  connected: true,
  email: "player@example.com",
  lastBackupAt: new Date(Date.now() - 2 * 3_600_000 - 60_000).toISOString(),
  frequency: "daily",
  retentionCount: 10,
};

function mockBackend(status: BackupStatus | null) {
  mockInvoke.mockImplementation((cmd: string) => {
    switch (cmd) {
      case "get_backup_status":
        return status ? Promise.resolve(status) : Promise.reject(new Error("not connected"));
      case "run_backup":
        return Promise.resolve({ fileId: "f", fileName: "backup.json", sizeBytes: 1_048_576, prunedCount: 0 });
      case "list_backups":
        return Promise.resolve([{ id: "b1", name: "backup-1", size: 2048, createdAt: "2026-10-01T09:30:00Z", schemaVersion: 7 }]);
      default:
        return Promise.resolve(null);
    }
  });
}

async function renderBackup() {
  render(<BackupSection />);
  await act(async () => {});
}

describe("v1 Settings › Cloud backup", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
  });

  it("shows the connection, last backup and schedule", async () => {
    mockBackend(connected);
    await renderBackup();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByTestId("backup-last")).toHaveTextContent("player@example.com · Last backup 2 hours ago");
    expect(screen.getByRole("combobox", { name: "How often to back up" })).toHaveTextContent("Daily");
    expect(screen.getByRole("combobox", { name: "Backups to keep" })).toHaveTextContent("10 backups");
  });

  it("back up now runs a backup and refreshes the status", async () => {
    mockBackend(connected);
    await renderBackup();
    mockInvoke.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Back up now" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith("run_backup");
    expect(mockInvoke).toHaveBeenCalledWith("get_backup_status");
  });

  it("disconnecting asks for confirmation first", async () => {
    mockBackend(connected);
    await renderBackup();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    const dialog = screen.getByRole("alertdialog", { name: "Disconnect Google Drive?" });
    expect(mockInvoke).not.toHaveBeenCalledWith("gdrive_auth_logout");

    // Cancel leaves the connection alone.
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mockInvoke).not.toHaveBeenCalledWith("gdrive_auth_logout");

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("gdrive_auth_logout");
    expect(await screen.findByRole("button", { name: "Connect Google Drive" })).toBeInTheDocument();
  });

  it("offers to connect when Google Drive isn't linked", async () => {
    mockBackend(null);
    await renderBackup();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect Google Drive" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith("gdrive_auth_start");
  });

  it("restoring a backup lists them and confirms before overwriting", async () => {
    mockBackend(connected);
    await renderBackup();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    });
    const dialog = screen.getByRole("dialog", { name: "Restore from a backup" });
    expect(mockInvoke).toHaveBeenCalledWith("list_backups");

    fireEvent.click(within(dialog).getByRole("button", { name: /^Restore backup from/ }));
    expect(screen.getByRole("alertdialog", { name: "Restore this backup?" })).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalledWith("restore_backup", expect.anything());

    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-action"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("restore_backup", { backupId: "b1" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Restore from a backup" })).not.toBeInTheDocument());
  });
});
