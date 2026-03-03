import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HealthCheckModal } from "@/components/Settings/HealthCheckModal";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import type { DeadGame } from "@/lib/tauri";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

function makeDeadGame(id: string, name: string, exePath?: string): DeadGame {
  return {
    id,
    name,
    source: "standalone",
    exePath: exePath ?? `C:\\Games\\${name}\\game.exe`,
    folderPath: `C:\\Games\\${name}`,
    lastPlayed: null,
    totalPlayTimeS: 0,
  };
}

describe("Story 14.2: HealthCheckModal", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      lastHealthCheckAt: "2026-03-01T10:00:00Z",
      healthCheckIssueCount: 2,
    });
    useGameStore.setState({ games: [], isLoading: false, error: null });
    useToastStore.setState({ toasts: [] });
  });

  it("renders modal when open=true", () => {
    const games = [makeDeadGame("g1", "Dead Game 1"), makeDeadGame("g2", "Dead Game 2")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("health-check-modal")).toBeInTheDocument();
  });

  it("does not render modal when open=false", () => {
    render(
      <HealthCheckModal
        open={false}
        deadGames={[]}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("health-check-modal")).not.toBeInTheDocument();
  });

  it("renders a row for each dead game", () => {
    const games = [makeDeadGame("g1", "Game A"), makeDeadGame("g2", "Game B")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("dead-game-row-g1")).toBeInTheDocument();
    expect(screen.getByTestId("dead-game-row-g2")).toBeInTheDocument();
  });

  it("shows all-clear state when dead games list is empty", () => {
    render(
      <HealthCheckModal
        open={true}
        deadGames={[]}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("health-check-all-clear")).toBeInTheDocument();
  });

  it("hides Remove All button when no dead games", () => {
    render(
      <HealthCheckModal
        open={true}
        deadGames={[]}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("health-check-remove-all")).not.toBeInTheDocument();
  });

  it("shows Remove All button when dead games exist", () => {
    const games = [makeDeadGame("g1", "Game A")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("health-check-remove-all")).toBeInTheDocument();
  });

  it("clicking Remove All shows confirmation dialog", () => {
    const games = [makeDeadGame("g1", "Game A")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("health-check-remove-all"));
    expect(screen.getByTestId("health-check-remove-all-confirm")).toBeInTheDocument();
  });

  it("Cancel in confirmation dialog hides it", () => {
    const games = [makeDeadGame("g1", "Game A")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("health-check-remove-all"));
    expect(screen.getByTestId("health-check-remove-all-confirm")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByTestId("health-check-remove-all-confirm")).not.toBeInTheDocument();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    render(
      <HealthCheckModal
        open={true}
        deadGames={[]}
        onClose={onClose}
        onDeadGamesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("health-check-modal-close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking backdrop calls onClose", () => {
    const onClose = vi.fn();
    render(
      <HealthCheckModal
        open={true}
        deadGames={[]}
        onClose={onClose}
        onDeadGamesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("health-check-modal-backdrop").firstChild as Element);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("individual Remove button triggers onDeadGamesChange without that game", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue(undefined);

    const games = [makeDeadGame("g1", "Game A"), makeDeadGame("g2", "Game B")];
    const onDeadGamesChange = vi.fn();
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={onDeadGamesChange}
      />,
    );
    fireEvent.click(screen.getByTestId("dead-game-remove-g1"));
    await vi.waitFor(() => {
      expect(onDeadGamesChange).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ id: "g2" })]),
      );
    });
    const callArg = onDeadGamesChange.mock.calls[0][0] as DeadGame[];
    expect(callArg.find((g) => g.id === "g1")).toBeUndefined();
  });

  it("individual Remove fires an undo toast", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockResolvedValue(undefined);

    const games = [makeDeadGame("g1", "Game A")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("dead-game-remove-g1"));
    await vi.waitFor(() => {
      const toasts = useToastStore.getState().toasts;
      expect(toasts.length).toBeGreaterThan(0);
      expect(toasts[0].action?.label).toBe("Undo");
    });
  });

  it("displays the game's exe path in the row", () => {
    const games = [makeDeadGame("g1", "Game A", "C:\\Games\\GameA\\game.exe")];
    render(
      <HealthCheckModal
        open={true}
        deadGames={games}
        onClose={vi.fn()}
        onDeadGamesChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("dead-game-path-g1")).toBeInTheDocument();
  });
});
