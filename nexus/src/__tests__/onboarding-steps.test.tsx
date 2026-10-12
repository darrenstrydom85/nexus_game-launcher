import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { WelcomeStep } from "@/components/Onboarding/WelcomeStep";
import { SteamGridDBStep } from "@/components/Onboarding/SteamGridDBStep";
import { IGDBStep } from "@/components/Onboarding/IGDBStep";
import { SourcesStep } from "@/components/Onboarding/SourcesStep";
import { ConfirmLibraryStep } from "@/components/Onboarding/ConfirmLibraryStep";
import { KeyVerifier, type KeyFieldConfig } from "@/components/Onboarding/KeyVerifier";
import { useOnboardingStore, type DetectedGame } from "@/stores/onboardingStore";
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
  totalPlayTimeS: 0, lastPlayedAt: null, playCount: 0, addedAt: "2026-01-01", isHidden: false,
  hltbMainH: null, hltbMainExtraH: null, hltbCompletionistH: null, hltbId: null, hltbFetchedAt: null, notes: null, progress: null, milestonesJson: null, completed: false,
});

const makeDetected = (name: string, source: string, sourceFolderId: string | null = null): DetectedGame => ({
  name, source, sourceId: null, sourceHint: null, folderPath: null, exePath: null,
  exeName: null, launchUrl: null, sourceFolderId, potentialExeNames: null,
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

  it("shows the logo tile and heading", () => {
    render(<WelcomeStep />);
    expect(screen.getByTestId("welcome-logo")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to Nexus" })).toBeInTheDocument();
  });

  it("shows tagline", () => {
    render(<WelcomeStep />);
    expect(screen.getByTestId("welcome-tagline")).toHaveTextContent(
      "All your games, from every launcher, in one place.",
    );
  });

  it("shows three feature rows", () => {
    render(<WelcomeStep />);
    const features = screen.getByTestId("welcome-features");
    expect(within(features).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByTestId("welcome-feature-0")).toHaveTextContent("Every launcher");
    expect(screen.getByTestId("welcome-feature-1")).toHaveTextContent("A library that looks the part");
    expect(screen.getByTestId("welcome-feature-2")).toHaveTextContent("Play and keep score");
  });

  it("does not auto-cycle: no timers are left running", () => {
    render(<WelcomeStep />);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("feature rows are not interactive", () => {
    render(<WelcomeStep />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
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
    useOnboardingStore.setState({ currentStep: "steamgriddb", completedSteps: ["welcome"] });
  });

  it("renders the how-to card and the key form", () => {
    render(<SteamGridDBStep />);
    expect(screen.getByTestId("steamgriddb-step")).toBeInTheDocument();
    expect(screen.getByTestId("steamgriddb-instructions")).toHaveTextContent("How to get one");
    expect(screen.getByTestId("steamgriddb-key-area")).toBeInTheDocument();
  });

  it("links to SteamGridDB in a new window", () => {
    render(<SteamGridDBStep />);
    const link = screen.getByRole("link", { name: /steamgriddb\.com/ });
    expect(link).toHaveAttribute("href", "https://www.steamgriddb.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows a time estimate", () => {
    render(<SteamGridDBStep />);
    expect(screen.getByTestId("steamgriddb-difficulty")).toHaveTextContent("About 2 minutes");
  });

  it("labels the key input and masks it, with a show/hide button", () => {
    render(<SteamGridDBStep />);
    const input = screen.getByLabelText("API key");
    expect(input).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Show key" }));
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide key" })).toBeInTheDocument();
  });

  it("Continue is disabled before verification", () => {
    render(<SteamGridDBStep />);
    expect(screen.getByTestId("steamgriddb-next")).toBeDisabled();
  });

  it("leaves skipping to the wizard footer (no skip button of its own)", () => {
    render(<SteamGridDBStep />);
    expect(screen.queryByTestId("steamgriddb-skip")).not.toBeInTheDocument();
  });

  it("verifies key on button click", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    render(<SteamGridDBStep />);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), {
      target: { value: "test-key-123" },
    });
    expect(screen.getByTestId("steamgriddb-next")).toHaveTextContent("Verify key");
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-next"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("set_setting", { key: "steamgrid_api_key", value: "test-key-123" });
    expect(mockInvoke).toHaveBeenCalledWith("verify_steamgrid_key");
  });

  it("Enter in the key input runs verify", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    const user = userEvent.setup();
    render(<SteamGridDBStep />);
    await user.type(screen.getByTestId("steamgriddb-key-input"), "abc{Enter}");
    expect(mockInvoke).toHaveBeenCalledWith("verify_steamgrid_key");
  });

  it("a valid key shows a green check, then the primary continues", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    render(<SteamGridDBStep />);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), { target: { value: "abc" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-next"));
    });
    const status = screen.getByTestId("steamgriddb-key-area-status");
    expect(status).toHaveAttribute("data-state", "success");
    expect(status).toHaveTextContent("Key verified");
    expect(screen.getByTestId("steamgriddb-next")).toHaveTextContent("Continue");

    fireEvent.click(screen.getByTestId("steamgriddb-next"));
    expect(useOnboardingStore.getState().currentStep).toBe("igdb");
  });

  it("an invalid key shows the error and stays put", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "verify_steamgrid_key" ? { valid: false, message: "Key rejected" } : undefined),
    );
    render(<SteamGridDBStep />);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), { target: { value: "bad" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-next"));
    });
    expect(screen.getByTestId("steamgriddb-key-area-error")).toHaveTextContent("Key rejected");
    expect(screen.getByTestId("steamgriddb-key-input")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByTestId("steamgriddb-next")).toHaveTextContent("Verify key");
    expect(useOnboardingStore.getState().currentStep).toBe("steamgriddb");
  });

  it("editing a verified key asks for verification again", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    render(<SteamGridDBStep />);
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), { target: { value: "abc" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("steamgriddb-next"));
    });
    fireEvent.change(screen.getByTestId("steamgriddb-key-input"), { target: { value: "abcd" } });
    expect(screen.getByTestId("steamgriddb-key-area-status")).toHaveAttribute("data-state", "idle");
    expect(screen.getByTestId("steamgriddb-next")).toHaveTextContent("Verify key");
  });

  it("revisiting a completed step can continue without re-entering the key", () => {
    useOnboardingStore.setState({ currentStep: "steamgriddb", completedSteps: ["welcome", "steamgriddb"] });
    render(<SteamGridDBStep />);
    const next = screen.getByTestId("steamgriddb-next");
    expect(next).toBeEnabled();
    expect(next).toHaveTextContent("Continue");
  });
});

describe("Story 9.3: IGDBStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "igdb", completedSteps: ["welcome", "steamgriddb"] });
  });

  it("renders the how-to card and the key form", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-step")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-instructions")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-key-area")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /dev\.twitch\.tv/ })).toHaveAttribute("href", "https://dev.twitch.tv");
  });

  it("shows a time estimate", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-difficulty")).toHaveTextContent("About 5 minutes");
  });

  it("has two labelled inputs: Client ID (plain) and Client secret (masked)", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-client-id")).toBeInTheDocument();
    expect(screen.getByTestId("igdb-client-secret")).toBeInTheDocument();
    expect(screen.getByLabelText("Client ID")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Client secret")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show secret" })).toBeInTheDocument();
  });

  it("Continue is disabled before verification", () => {
    render(<IGDBStep />);
    expect(screen.getByTestId("igdb-next")).toBeDisabled();
  });

  it("needs both values before it can verify", () => {
    render(<IGDBStep />);
    fireEvent.change(screen.getByTestId("igdb-client-id-input"), { target: { value: "client-id" } });
    expect(screen.getByTestId("igdb-next")).toBeDisabled();
  });

  it("leaves skipping to the wizard footer (no skip button of its own)", () => {
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
      fireEvent.click(screen.getByTestId("igdb-next"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("verify_igdb_keys");
    expect(screen.getByTestId("igdb-key-area-status")).toHaveTextContent("Keys verified");
  });

  it("Enter in either input runs verify once both are filled", async () => {
    mockInvoke.mockResolvedValue({ valid: true, message: "OK" });
    const user = userEvent.setup();
    render(<IGDBStep />);
    await user.type(screen.getByTestId("igdb-client-id-input"), "id{Enter}");
    expect(mockInvoke).not.toHaveBeenCalledWith("verify_igdb_keys");
    await user.type(screen.getByTestId("igdb-client-secret-input"), "secret");
    await user.type(screen.getByTestId("igdb-client-id-input"), "{Enter}");
    expect(mockInvoke).toHaveBeenCalledWith("verify_igdb_keys");
  });

  it("explains a rejected client ID in plain English", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      Promise.resolve(cmd === "verify_igdb_keys" ? { valid: false, message: "Invalid client id" } : undefined),
    );
    render(<IGDBStep />);
    fireEvent.change(screen.getByTestId("igdb-client-id-input"), { target: { value: "x" } });
    fireEvent.change(screen.getByTestId("igdb-client-secret-input"), { target: { value: "y" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("igdb-next"));
    });
    expect(screen.getByTestId("igdb-key-area-error")).toHaveTextContent("client ID wasn’t accepted");
  });
});

describe("KeyVerifier (shared key form)", () => {
  const field = (overrides: Partial<KeyFieldConfig> = {}): KeyFieldConfig => ({
    label: "Test key",
    value: "",
    onChange: () => {},
    testId: "test-kv",
    ...overrides,
  });
  const base = {
    id: "kv-form",
    testId: "kv",
    idleText: "Paste it",
    checkingText: "Checking",
    successText: "Verified",
    onSubmit: () => {},
  };

  it("renders a labelled input per field", () => {
    render(<KeyVerifier {...base} fields={[field(), field({ label: "Other", testId: "other" })]} verifyState="idle" />);
    expect(screen.getByTestId("test-kv-input")).toBeInTheDocument();
    expect(screen.getByLabelText("Test key")).toBe(screen.getByTestId("test-kv-input"));
    expect(screen.getByLabelText("Other")).toBeInTheDocument();
  });

  it("shows the idle hint, checking text and success text for each state", () => {
    const { rerender } = render(<KeyVerifier {...base} fields={[field()]} verifyState="idle" />);
    expect(screen.getByTestId("kv-status")).toHaveTextContent("Paste it");
    rerender(<KeyVerifier {...base} fields={[field()]} verifyState="verifying" />);
    expect(screen.getByTestId("kv-status")).toHaveTextContent("Checking");
    rerender(<KeyVerifier {...base} fields={[field()]} verifyState="success" />);
    expect(screen.getByTestId("kv-status")).toHaveTextContent("Verified");
  });

  it("shows error message on error state", () => {
    render(<KeyVerifier {...base} fields={[field({ value: "abc" })]} verifyState="error" errorMessage="Invalid key" />);
    expect(screen.getByTestId("kv-error")).toHaveTextContent("Invalid key");
  });

  it("has mask toggle for masked inputs only", () => {
    render(<KeyVerifier {...base} fields={[field({ masked: true, value: "secret" }), field({ testId: "plain" })]} verifyState="idle" />);
    expect(screen.getByTestId("test-kv-toggle")).toHaveAttribute("aria-label", "Show key");
    expect(screen.queryByTestId("plain-toggle")).not.toBeInTheDocument();
  });

  it("submits once on Enter, even with several fields and the submit button outside the form", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <KeyVerifier {...base} onSubmit={onSubmit} fields={[field({ value: "abc" }), field({ testId: "two", label: "Two", value: "x" })]} verifyState="idle" />
        <button type="submit" form="kv-form">Go</button>
      </>,
    );
    await user.type(screen.getByTestId("test-kv-input"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("Story 9.4: SourcesStep", () => {
  const launchers = [
    { sourceId: "steam", displayName: "Steam", resolvedPath: "C:\\Steam", detectionMethod: "auto" },
    { sourceId: "epic", displayName: "Epic Games", resolvedPath: null, detectionMethod: "unavailable" },
  ];
  const folders = [{ id: "f1", path: "D:\\Games" }];
  const scan = {
    games: [makeDetected("Portal", "steam"), makeDetected("Hades", "steam"), makeDetected("Indie", "standalone", "f1")],
    errors: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useOnboardingStore.getState().resetOnboarding();
    useOnboardingStore.setState({ currentStep: "sources" });
    useSettingsStore.setState({ watchedFolders: [] });
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "detect_launchers") return Promise.resolve(launchers);
      if (cmd === "get_watched_folders") return Promise.resolve(folders);
      if (cmd === "scan_sources") return Promise.resolve(scan);
      return Promise.resolve(undefined);
    });
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

  it("shows skeleton rows while detecting", () => {
    mockInvoke.mockImplementation(() => new Promise(() => {}));
    render(<SourcesStep />);
    expect(screen.getAllByTestId("launcher-skeleton")).toHaveLength(6);
    expect(screen.getByTestId("detected-launchers")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("scan-now")).toBeDisabled();
  });

  it("shows detected launchers with switches", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("detected-launchers")).toBeInTheDocument();
    expect(screen.queryByTestId("launcher-skeleton")).not.toBeInTheDocument();
    expect(screen.getByTestId("launcher-steam")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Steam" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: "Epic Games" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("launcher-epic")).toHaveTextContent("Not installed");
  });

  it("switch toggles a launcher", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    fireEvent.click(screen.getByTestId("launcher-check-steam"));
    expect(screen.getByTestId("launcher-check-steam")).toHaveAttribute("aria-checked", "false");
  });

  it("has Add folder button", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("add-folder")).toHaveTextContent("Add folder");
  });

  it("shows game folders section with a Remove button per folder", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("game-folders")).toBeInTheDocument();
    expect(screen.getByTestId("folder-D:\\Games")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remove D:\\Games" }));
    });
    expect(mockInvoke).toHaveBeenCalledWith("remove_watched_folder", { id: "f1" });
    expect(screen.queryByTestId("folder-D:\\Games")).not.toBeInTheDocument();
  });

  it("has Scan for games button", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    expect(screen.getByTestId("scan-now")).toHaveTextContent("Scan for games");
  });

  it("scanning saves source choices, then shows counts and Continue", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("scan-now"));
    });
    expect(useSettingsStore.getState().sourcesEnabled.steam).toBe(true);
    expect(useSettingsStore.getState().sourcesEnabled.epic).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("scan_sources");
    expect(useOnboardingStore.getState().detectedGames).toHaveLength(3);
    expect(useGameStore.getState().games).toHaveLength(3);

    expect(screen.getByTestId("scan-status")).toHaveTextContent("Found 3 games");
    expect(screen.getByTestId("launcher-steam")).toHaveTextContent("2 games found");
    expect(screen.getByTestId("folder-D:\\Games")).toHaveTextContent("1 game found");
    expect(screen.getByTestId("scan-now")).toHaveTextContent("Scan again");

    fireEvent.click(screen.getByTestId("sources-next"));
    expect(useOnboardingStore.getState().currentStep).toBe("confirm");
  });

  it("changing a launcher after scanning asks for a fresh scan", async () => {
    await act(async () => {
      render(<SourcesStep />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("scan-now"));
    });
    fireEvent.click(screen.getByTestId("launcher-check-epic"));
    expect(screen.queryByTestId("sources-next")).not.toBeInTheDocument();
    expect(screen.getByTestId("scan-now")).toHaveTextContent("Scan for games");
  });

  it("can't scan with nothing selected, and says why", async () => {
    mockInvoke.mockImplementation((cmd: string) => {
      if (cmd === "detect_launchers") return Promise.resolve(launchers);
      if (cmd === "get_watched_folders") return Promise.resolve([]);
      return Promise.resolve(undefined);
    });
    await act(async () => {
      render(<SourcesStep />);
    });
    fireEvent.click(screen.getByTestId("launcher-check-steam"));
    expect(screen.getByTestId("scan-now")).toBeDisabled();
    expect(screen.getByTestId("scan-now")).toHaveAccessibleDescription("Turn on a launcher or add a folder first.");
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

  it("shows a summary line", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-top-bar")).toHaveTextContent("3 games from 2 launchers");
    expect(screen.getByTestId("confirm-selected-count")).toHaveTextContent("3 selected");
  });

  it("mentions folders in the summary", () => {
    useGameStore.setState({ games: [makeGame("g1", "A", "steam"), makeGame("g2", "B", "standalone")] });
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-top-bar")).toHaveTextContent("2 games from 1 launcher and your folders");
  });

  it("groups games by source", () => {
    render(<ConfirmLibraryStep />);
    const steam = screen.getByTestId("confirm-group-steam");
    expect(within(steam).getByTestId("confirm-card-g1")).toBeInTheDocument();
    expect(within(steam).getByTestId("confirm-card-g3")).toBeInTheDocument();
    expect(within(screen.getByTestId("confirm-group-epic")).getByTestId("confirm-card-g2")).toBeInTheDocument();
  });

  it("renders game rows as checkboxes in the list", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-game-list")).toBeInTheDocument();
    expect(screen.getByTestId("confirm-card-g1")).toHaveAttribute("role", "checkbox");
    expect(screen.getByTestId("confirm-card-g2")).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("checkbox", { name: "Game One" })).toBeInTheDocument();
  });

  it("toggle excludes/includes game", () => {
    render(<ConfirmLibraryStep />);
    const card = screen.getByTestId("confirm-card-g1");
    expect(card).toHaveAttribute("aria-checked", "true");
    fireEvent.click(card);
    expect(screen.getByTestId("confirm-card-g1")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("confirm-finish")).toHaveTextContent("Add 2 games to Nexus");
  });

  it("re-toggling excluded game restores it", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-card-g2"));
    expect(screen.getByTestId("confirm-card-g2")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("confirm-card-g2"));
    expect(screen.getByTestId("confirm-card-g2")).toHaveAttribute("aria-checked", "true");
  });

  it("group checkbox selects or clears a whole source", () => {
    render(<ConfirmLibraryStep />);
    const toggle = screen.getByTestId("confirm-group-toggle-steam");
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(screen.getByTestId("confirm-card-g1")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("confirm-card-g3")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("confirm-card-g2")).toHaveAttribute("aria-checked", "true");
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(screen.getByTestId("confirm-card-g1"));
    expect(toggle).toHaveAttribute("aria-checked", "mixed");
  });

  it("filter field narrows the list by name", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.change(screen.getByTestId("confirm-filter"), { target: { value: "two" } });
    expect(screen.getByTestId("confirm-card-g2")).toBeInTheDocument();
    expect(screen.queryByTestId("confirm-card-g1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("confirm-group-steam")).not.toBeInTheDocument();
  });

  it("select none / select all apply to the filtered games", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.change(screen.getByTestId("confirm-filter"), { target: { value: "one" } });
    fireEvent.click(screen.getByTestId("confirm-select-none"));
    fireEvent.change(screen.getByTestId("confirm-filter"), { target: { value: "" } });
    expect(screen.getByTestId("confirm-card-g1")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("confirm-card-g2")).toHaveAttribute("aria-checked", "true");

    fireEvent.click(screen.getByTestId("confirm-select-all"));
    expect(screen.getByTestId("confirm-card-g1")).toHaveAttribute("aria-checked", "true");
  });

  it("with nothing selected, the import is disabled and explains why", () => {
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-select-none"));
    const finish = screen.getByTestId("confirm-finish");
    expect(finish).toBeDisabled();
    expect(finish).toHaveAccessibleDescription("Select at least one game to add.");
  });

  it("'Add N games' calls confirm_games, hides excluded games and completes onboarding", async () => {
    mockInvoke.mockResolvedValue(undefined);
    render(<ConfirmLibraryStep />);
    fireEvent.click(screen.getByTestId("confirm-card-g2"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-finish"));
    });
    expect(mockInvoke).toHaveBeenCalledWith("confirm_games", expect.any(Object));
    const payload = mockInvoke.mock.calls.find(([cmd]) => cmd === "confirm_games")![1] as {
      detectedGames: { name: string; isHidden: boolean }[];
    };
    expect(payload.detectedGames).toHaveLength(3);
    expect(payload.detectedGames.find((g) => g.name === "Game Two")!.isHidden).toBe(true);
    expect(payload.detectedGames.find((g) => g.name === "Game One")!.isHidden).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("relink_play_sessions");
    expect(mockInvoke).toHaveBeenCalledWith("set_setting", { key: "onboarding_completed", value: "true" });
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });

  it("shows the error and stays on the step when saving fails", async () => {
    mockInvoke.mockImplementation((cmd: string) =>
      cmd === "confirm_games" ? Promise.reject("disk full") : Promise.resolve(undefined),
    );
    render(<ConfirmLibraryStep />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-finish"));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("disk full");
    expect(screen.getByTestId("confirm-finish")).toBeEnabled();
    expect(useOnboardingStore.getState().isCompleted).toBe(false);
  });

  it("shows included count in finish button", () => {
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-finish")).toHaveTextContent("3 games");
  });

  it("with no games found, can still finish setup", async () => {
    mockInvoke.mockResolvedValue(undefined);
    useGameStore.setState({ games: [] });
    render(<ConfirmLibraryStep />);
    expect(screen.getByTestId("confirm-empty")).toBeInTheDocument();
    const finish = screen.getByTestId("confirm-finish");
    expect(finish).toHaveTextContent("Finish setup");
    expect(finish).toBeEnabled();
    await act(async () => {
      fireEvent.click(finish);
    });
    expect(useOnboardingStore.getState().isCompleted).toBe(true);
  });

  it("keeps a large library to plain rows", () => {
    useGameStore.setState({
      games: Array.from({ length: 600 }, (_, i) => makeGame(`detected-${i}`, `Game ${i}`, i % 2 ? "steam" : "epic")),
    });
    render(<ConfirmLibraryStep />);
    expect(screen.getAllByRole("checkbox", { name: /^Game \d+$/ })).toHaveLength(600);
    expect(screen.getByTestId("confirm-finish")).toHaveTextContent("Add 600 games to Nexus");
  });
});
