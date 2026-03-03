import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockFetchMetadata = vi.fn();
vi.mock("@/lib/tauri", () => ({
  fetchMetadata: (gameId: string) => mockFetchMetadata(gameId),
}));

const mockUseGameStore = vi.fn();
vi.mock("@/stores/gameStore", () => ({
  useGameStore: (selector: (s: { games: { id: string; name: string }[] }) => unknown) =>
    mockUseGameStore(selector),
}));

import { SyncErrorPopover } from "@/components/Library/SyncErrorPopover";
import type { SyncError } from "@/stores/syncStore";

function getDefaultGames() {
  return [
    { id: "g1", name: "Game One" },
    { id: "g2", name: "Game Two" },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseGameStore.mockImplementation(
    (selector: (s: { games: { id: string; name: string }[] }) => unknown) =>
      selector({ games: getDefaultGames() }),
  );
  mockFetchMetadata.mockResolvedValue(undefined);
});

describe("SyncErrorPopover", () => {
  it("does not render when errors is empty", () => {
    render(<SyncErrorPopover errors={[]} />);
    expect(screen.queryByTestId("sync-errors-badge")).not.toBeInTheDocument();
  });

  it("badge shows correct error count", () => {
    const errors: SyncError[] = [
      { source: "IGDB", gameId: "g1", message: "fail" },
      { source: "SteamGridDB", gameId: "g2", message: "rate limit" },
    ];
    render(<SyncErrorPopover errors={errors} />);
    expect(screen.getByTestId("sync-errors-badge")).toHaveTextContent("2 errors");
  });

  it("clicking badge opens popover", async () => {
    const user = userEvent.setup();
    const errors: SyncError[] = [
      { source: "IGDB", gameId: "g1", message: "fail" },
    ];
    render(<SyncErrorPopover errors={errors} />);
    await user.click(screen.getByTestId("sync-errors-badge"));
    await waitFor(() => {
      expect(screen.getByTestId("sync-error-popover")).toBeInTheDocument();
    });
    expect(screen.getByRole("dialog", { name: "Sync errors" })).toBeInTheDocument();
    expect(screen.getByText("Sync errors (1)")).toBeInTheDocument();
  });

  it("each error row renders game name and error message", async () => {
    const user = userEvent.setup();
    const errors: SyncError[] = [
      { source: "IGDB", gameId: "g1", message: "API error" },
      { source: "SteamGridDB", gameId: "g2", message: "Not found" },
    ];
    render(<SyncErrorPopover errors={errors} />);
    await user.click(screen.getByTestId("sync-errors-badge"));
    await waitFor(() => {
      expect(screen.getByTestId("sync-error-popover")).toBeInTheDocument();
    });
    expect(screen.getByText("Game One")).toBeInTheDocument();
    expect(screen.getByText("API error")).toBeInTheDocument();
    expect(screen.getByText("Game Two")).toBeInTheDocument();
    expect(screen.getByText("Not found")).toBeInTheDocument();
  });

  it("retry button calls fetchMetadata with correct game_id", async () => {
    const user = userEvent.setup();
    const errors: SyncError[] = [
      { source: "IGDB", gameId: "g1", message: "fail" },
    ];
    render(<SyncErrorPopover errors={errors} />);
    await user.click(screen.getByTestId("sync-errors-badge"));
    await waitFor(() => {
      expect(screen.getByTestId("sync-error-retry-g1")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("sync-error-retry-g1"));
    expect(mockFetchMetadata).toHaveBeenCalledTimes(1);
    expect(mockFetchMetadata).toHaveBeenCalledWith("g1");
  });

  it("Retry all calls fetchMetadata for every error", async () => {
    const user = userEvent.setup();
    const errors: SyncError[] = [
      { source: "IGDB", gameId: "g1", message: "fail" },
      { source: "SteamGridDB", gameId: "g2", message: "rate limit" },
    ];
    render(<SyncErrorPopover errors={errors} />);
    await user.click(screen.getByTestId("sync-errors-badge"));
    await waitFor(() => {
      expect(screen.getByTestId("sync-error-retry-all")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("sync-error-retry-all"));
    await waitFor(() => {
      expect(mockFetchMetadata).toHaveBeenCalledTimes(2);
    });
    expect(mockFetchMetadata).toHaveBeenNthCalledWith(1, "g1");
    expect(mockFetchMetadata).toHaveBeenNthCalledWith(2, "g2");
  });

  it("Escape closes popover", async () => {
    const user = userEvent.setup();
    const errors: SyncError[] = [
      { source: "IGDB", gameId: "g1", message: "fail" },
    ];
    render(<SyncErrorPopover errors={errors} />);
    await user.click(screen.getByTestId("sync-errors-badge"));
    await waitFor(() => {
      expect(screen.getByTestId("sync-error-popover")).toBeInTheDocument();
    });
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByTestId("sync-error-popover")).not.toBeInTheDocument();
    });
  });
});
