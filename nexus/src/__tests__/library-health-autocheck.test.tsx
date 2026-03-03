import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";
import { LibraryHealth } from "@/components/Settings/LibraryHealth";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

vi.mock("@/lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tauri")>();
  return {
    ...actual,
    checkLibraryHealth: vi.fn(),
  };
});

describe("Story 14.3: Auto health check logic", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      lastHealthCheckAt: null,
      healthCheckIssueCount: 0,
      healthCheckSnoozedUntil: null,
      autoHealthCheck: true,
    });
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders Library Health section", () => {
    render(<LibraryHealth />);
    expect(screen.getByTestId("library-health-section")).toBeInTheDocument();
  });

  it("shows 'Never checked' when lastHealthCheckAt is null", () => {
    render(<LibraryHealth />);
    expect(screen.getByText("Never checked")).toBeInTheDocument();
  });

  it("shows last check date when lastHealthCheckAt is set", () => {
    useSettingsStore.setState({ lastHealthCheckAt: "2026-02-01T10:00:00Z" });
    render(<LibraryHealth />);
    expect(screen.getByText(/Last checked/)).toBeInTheDocument();
  });

  it("Run Health Check button is present", () => {
    render(<LibraryHealth />);
    expect(screen.getByTestId("run-health-check")).toBeInTheDocument();
  });

  it("auto-check toggle is rendered", () => {
    render(<LibraryHealth />);
    expect(screen.getByTestId("auto-health-check-toggle")).toBeInTheDocument();
  });

  it("auto-check toggle reflects autoHealthCheck state", () => {
    useSettingsStore.setState({ autoHealthCheck: true });
    render(<LibraryHealth />);
    expect(screen.getByTestId("auto-health-check-toggle")).toHaveAttribute("aria-checked", "true");
  });

  it("auto-check toggle can be turned off", () => {
    useSettingsStore.setState({ autoHealthCheck: true });
    render(<LibraryHealth />);
    fireEvent.click(screen.getByTestId("auto-health-check-toggle"));
    expect(useSettingsStore.getState().autoHealthCheck).toBe(false);
  });

  it("auto-check toggle can be turned on", () => {
    useSettingsStore.setState({ autoHealthCheck: false });
    render(<LibraryHealth />);
    fireEvent.click(screen.getByTestId("auto-health-check-toggle"));
    expect(useSettingsStore.getState().autoHealthCheck).toBe(true);
  });

  it("shows all-healthy state after check with no issues", async () => {
    const { checkLibraryHealth } = await import("@/lib/tauri");
    vi.mocked(checkLibraryHealth).mockResolvedValue({
      deadGames: [],
      totalChecked: 5,
      checkedAt: "2026-03-02T10:00:00Z",
    });

    render(<LibraryHealth />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-health-check"));
    });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId("health-check-all-healthy")).toBeInTheDocument();
  });

  it("shows issues-found state after check with dead games", async () => {
    const { checkLibraryHealth } = await import("@/lib/tauri");
    vi.mocked(checkLibraryHealth).mockResolvedValue({
      deadGames: [
        { id: "g1", name: "Dead Game", source: "standalone", exePath: "C:\\fake.exe", folderPath: null, lastPlayed: null, totalPlayTimeS: 0 },
      ],
      totalChecked: 3,
      checkedAt: "2026-03-02T10:00:00Z",
    });

    render(<LibraryHealth />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-health-check"));
    });
    await act(async () => { await Promise.resolve(); });

    expect(screen.getByTestId("health-check-issues-found")).toBeInTheDocument();
  });

  it("Review button opens the HealthCheckModal", async () => {
    const { checkLibraryHealth } = await import("@/lib/tauri");
    vi.mocked(checkLibraryHealth).mockResolvedValue({
      deadGames: [
        { id: "g1", name: "Dead Game", source: "standalone", exePath: "C:\\fake.exe", folderPath: null, lastPlayed: null, totalPlayTimeS: 0 },
      ],
      totalChecked: 1,
      checkedAt: "2026-03-02T10:00:00Z",
    });

    render(<LibraryHealth />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-health-check"));
    });
    await act(async () => { await Promise.resolve(); });

    fireEvent.click(screen.getByTestId("health-check-review"));
    expect(screen.getByTestId("health-check-modal")).toBeInTheDocument();
  });

  it("updates settingsStore lastHealthCheckAt after running check", async () => {
    const { checkLibraryHealth } = await import("@/lib/tauri");
    vi.mocked(checkLibraryHealth).mockResolvedValue({
      deadGames: [],
      totalChecked: 2,
      checkedAt: "2026-03-02T12:00:00Z",
    });

    render(<LibraryHealth />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-health-check"));
    });
    await act(async () => { await Promise.resolve(); });

    expect(useSettingsStore.getState().lastHealthCheckAt).toBe("2026-03-02T12:00:00Z");
  });

  it("updates settingsStore healthCheckIssueCount after running check", async () => {
    const { checkLibraryHealth } = await import("@/lib/tauri");
    vi.mocked(checkLibraryHealth).mockResolvedValue({
      deadGames: [
        { id: "g1", name: "Dead", source: "standalone", exePath: null, folderPath: null, lastPlayed: null, totalPlayTimeS: 0 },
        { id: "g2", name: "Dead2", source: "standalone", exePath: null, folderPath: null, lastPlayed: null, totalPlayTimeS: 0 },
      ],
      totalChecked: 5,
      checkedAt: "2026-03-02T12:00:00Z",
    });

    render(<LibraryHealth />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("run-health-check"));
    });
    await act(async () => { await Promise.resolve(); });

    expect(useSettingsStore.getState().healthCheckIssueCount).toBe(2);
  });
});
