import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { WelcomeStep } from "@/components/Onboarding/WelcomeStep";
import { SteamGridDBStep } from "@/components/Onboarding/SteamGridDBStep";
import { IGDBStep } from "@/components/Onboarding/IGDBStep";
import { SourcesStep } from "@/components/Onboarding/SourcesStep";
import { ConfirmLibraryStep } from "@/components/Onboarding/ConfirmLibraryStep";
import { KeyVerifier } from "@/components/Onboarding/KeyVerifier";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore, type Game } from "@/stores/gameStore";

const makeGame = (id: string, name: string, source: string = "steam"): Game => ({
  id, name, source: source as Game["source"],
  folderPath: null, exePath: null, exeName: null, launchUrl: null,
  igdbId: null, steamgridId: null, description: null,
  coverUrl: null, heroUrl: null, logoUrl: null, iconUrl: null,
  customCover: null, customHero: null, potentialExeNames: null,
  genres: [], releaseDate: null,
  criticScore: null, criticScoreCount: null, communityScore: null, communityScoreCount: null, trailerUrl: null,
  status: "unset", rating: null,
  totalPlayTimeS: 0, lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01",
});

describe("Story 9.2: WelcomeStep", () => {
  beforeEach(() => {
    useOnboardingStore.getState().resetOnboarding();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders welcome step", () => {
    render(<WelcomeStep />);
    expect(screen.getByTestId("welcome-step")).toBeInTheDocument();
  });

  it("shows logo with animated glow", () => {
    render(<WelcomeStep />);
    expect(screen.getByTestId("welcome-logo")).toBeInTheDocument();
  });

  it("shows tagline", () => {
    render(<WelcomeStep />);
    expect(screen.getByTestId("welcome-tagline")).toHaveTextContent(
      "All your games. One place.",
    );
  });

  it("shows three panels: Scan, Organize, Play", () => {
    render(<WelcomeStep />);
    expect(screen.getByTestId("welcome-panels")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-panel-0")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-panel-1")).toBeInTheDocument();
    expect(screen.getByTestId("welcome-panel-2")).toBeInTheDocument();
  });

  it("panels auto-advance every 3s", () => {
    render(<WelcomeStep />);
    act(() => { vi.advanceTimersByTime(3000); });
    // Panel 1 should now be active (index 1)
    expect(screen.getByTestId("welcome-panel-1").className).toContain("border-primary");
  });

  it("clicking panel selects it", () => {
    render(<WelcomeStep />);
    fireEvent.click(screen.getByTestId("welcome-panel-2"));
    expect(screen.getByTestId("welcome-panel-2").className).toContain("border-primary");
  });

  it("'Let's get started' advances to next step", () => {
    render(<WelcomeStep />);
    fireEvent.click(screen.getByTestId("welcome-start"));
    expect(useOnboardingStore.getState().currentStep).toBe("steamgriddb");
  });

  it("does not show skip setup option", () => {
    render(<WelcomeStep />);
    expect(screen.queryByTestId("welcome-skip-all")).not.toBeInTheDocument();
  });
});

describe("Story 9.2: SteamGridDBStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "steamgriddb" });
  });

  it("renders steamgriddb step with split layout", () => {
    render(<SteamGridDBStep />);
    expect(screen.getByTestId("steamgriddb-step")).toBeInTheDocument();
    expect(screen.getByTestId("steamgriddb-instructions")).toBeInTheDocument();
    expect(screen.getByTestId("steamgriddb-key-area")).toBeInTheDocument();
  });

  it("shows difficulty badge", () => {
    render(<SteamGridDBStep />);
    expect(screen.getByTestId("steamgriddb-difficulty")).toHaveTextContent("Easy — 2 minutes");
  });

  it("Continue is disabled before verification", () => {
    render(<SteamGridDBStep />);
    expect(screen.getByTestId("steamgriddb-next")).toBeDisabled();
  });

  it("does not show skip option", () => {
    render(<SteamGridDBStep />);
    expect(screen.queryByTestId("steamgriddb-skip")).not.toBeInTheDocument();
  });

  it("verifies key on button click", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    render(<SteamGridDBStep />);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), {
      target: { value: "test-key-123" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-key-verify"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("verify_steamgrid_key");
  });
});

describe("Story 9.3: IGDBStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "igdb" });
  });

  it("renders IGDB step with split layout", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-step")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-instructions")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-key-area")).toBeInTheDocument();
  });

  it("shows difficulty badge", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-difficulty")).toHaveTextContent("Medium — 5 minutes");
  });

  it("has two key inputs: Client ID and Client Secret", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-client-id")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-client-secret")).toBeInTheDocument();
  });

  it("Continue is disabled before verification", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-next")).toBeDisabled();
  });

  it("does not show skip option", () => {
    render(<IGDBStep />);
    expect(screen.queryByTestId("igdb-skip")).not.toBeInTheDocument();
  });

  it("verifies keys on button click", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    render(<IGDBStep />);
    fireEvent.change(screen.getByTestId("igdb-client-id-input"), {
      target: { value: "client-id" },
    });
    fireEvent.change(screen.getByTestId("igdb-client-secret-input"), {
      target: { value: "client-secret" },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("igdb-client-secret-verify"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("verify_igdb_keys");
  });
});

describe("KeyVerifier (shared component)", () => {
  it("renders input and verify button", () => {
    render(
      <KeyVerifier
        label="Test Key"
        value=""
        onChange={() => {}}
        verifyState="idle"
        onVerify={() => {}}
        testId="test-kv"
      />,
    );
    expect(screen.getByTestId("test-kv")).toBeInTheDocument();
    expect(screen.getByTestId("test-kv-input")).toBeInTheDocument();
    expect(screen.getByTestId("test-kv-verify")).toBeInTheDocument();
  });

  it("verify button disabled when value is empty", () => {
    render(
      <KeyVerifier label="Key" value="" onChange={() => {}} verifyState="idle" onVerify={() => {}} testId="kv" />,
    );
    expect(screen.getByTestId("kv-verify")).toBeDisabled();
  });

  it("shows error message on error state", () => {
    render(
      <KeyVerifier
        label="Key"
        value="abc"
        onChange={() => {}}
        verifyState="error"
        errorMessage="Invalid key"
        onVerify={() => {}}
        testId="kv"
      />,
    );
    expect(screen.getByTestId("kv-error")).toHaveTextContent("Invalid key");
  });

  it("has mask toggle for masked inputs", () => {
    render(
      <KeyVerifier label="Key" value="secret" onChange={() => {}} masked verifyState="idle" onVerify={() => {}} testId="kv" />,
    );
    expect(screen.getByTestId("kv-toggle")).toBeInTheDocument();
  });
});

describe("Story 9.4: SourcesStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "sources" });
    useSettingsStore.setState({ watchedFolders: [] });
    mockInvoke.mockResolvedValue([
      { sourceId: "steam", displayName: "Steam", resolvedPath: "C:\\Steam", detectionMethod: "auto" },
      { sourceId: "epic", displayName: "Epic Games", resolvedPath: null, detectionMethod: "unavailable" },
    ]);
  });

  it("renders sources step", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("sources-step")).toBeInTheDocument();
  });

  it("auto-detects launchers on mount", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(mockInvoke).toHaveBeenCalledWith("detect_launchers");
  });

  it("shows detected launchers with checkboxes", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("detected-launchers")).toBeInTheDocument();
    expect(screen.getByTestId("launcher-steam")).toBeInTheDocument();
  });

  it("has Add Folder button", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("add-folder")).toBeInTheDocument();
  });

  it("has Scan Now button", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("scan-now")).toBeInTheDocument();
  });

  it("shows game folders section", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("game-folders")).toBeInTheDocument();
  });
});

describe("Story 9.5: ConfirmLibraryStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "confirm" });
    useGameStore.setState({
      games: [
        makeGame("g1", "Game One", "steam"),
        makeGame("g2", "Game Two", "epic"),
        makeGame("g3", "Game Three", "steam"),
      ],
    });
  });

  it("renders confirm step", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-step")).toBeInTheDocument();
  });

  it("shows game count in top bar", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-top-bar")).toHaveTextContent("Found 3 games across 2 sources");
  });

  it("shows filter tabs: All + per source", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-filter-tabs")).toBeInTheDocument();
    expect(screen.getByTestId("filter-all")).toBeInTheDocument();
    expect(screen.getByTestId("filter-steam")).toBeInTheDocument();
    expect(screen.getByTestId("filter-epic")).toBeInTheDocument();
  });

  it("renders game cards in grid", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-game-grid")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-card-g1")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-card-g2")).toBeInTheDocument();
  });

  it("allows inline name editing", () => {
    render(<ConfirmLibraryStep />);
    const input = screen.getByTestId("confirm-name-g1");
    fireEvent.change(input, { target: { value: "Renamed Game" } });
    expect(input).toHaveValue("Renamed Game");
  });

  it("toggle excludes/includes game", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-toggle-g1"));
    const card = screen.getByTestId("confirm-card-g1");
    expect(card.className).toContain("opacity-50");
  });

  it("dismiss removes game from list", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-dismiss-g2"));
    expect(screen.queryByTestId("confirm-card-g2")).not.toBeInTheDocument();
  });

  it("filter tabs filter by source", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("filter-epic"));
    expect(screen.getByTestId("confirm-card-g2")).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-card-g1")).not.toBeInTheDocument();
  });

  it("'Looks good' button calls confirm_games and completes onboarding", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<ConfirmLibraryStep />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-finish"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("confirm_games", expect.any(Object));
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });

  it("'Scan again' goes back to sources step", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-scan-again"));
    expect(useOnboardingStore.getState().currentStep).toBe("sources");
  });

  it("shows included count in finish button", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-finish")).toHaveTextContent("3 games");
  });
});
