import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProgressSlider } from "@/components/GameDetail/ProgressSlider";
import { MilestoneList } from "@/components/GameDetail/MilestoneList";
import { GameProgress } from "@/components/GameDetail/GameProgress";
import { GameCard } from "@/components/GameCard/GameCard";
import { useGameStore, type Game, type Milestone } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";

const mockGame: Game = {
  id: "g1",
  name: "Elden Ring",
  source: "steam",
  folderPath: null,
  exePath: null,
  exeName: null,
  launchUrl: null,
  igdbId: null,
  steamgridId: null,
  description: null,
  coverUrl: "https://example.com/cover.jpg",
  heroUrl: null,
  logoUrl: null,
  iconUrl: null,
  customCover: null,
  customHero: null,
  potentialExeNames: null,
  genres: [],
  releaseDate: null,
  criticScore: null,
  criticScoreCount: null,
  communityScore: null,
  communityScoreCount: null,
  trailerUrl: null,
  status: "playing",
  rating: null,
  totalPlayTimeS: 3600,
  lastPlayedAt: null,
  playCount: 1,
  addedAt: "2026-01-01",
  isHidden: false,
  hltbMainH: null,
  hltbMainExtraH: null,
  hltbCompletionistH: null,
  hltbId: null,
  hltbFetchedAt: null,
  notes: null,
  progress: null,
  milestonesJson: null,
};

describe("ProgressBar component", () => {
  it("renders with correct aria attributes", () => {
    render(<ProgressBar value={42} data-testid="pb" />);
    const bar = screen.getByTestId("pb");
    expect(bar).toHaveAttribute("role", "progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("clamps value to 0-100", () => {
    render(<ProgressBar value={150} data-testid="pb" />);
    expect(screen.getByTestId("pb")).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders with custom height", () => {
    render(<ProgressBar value={50} height={2} data-testid="pb" />);
    expect(screen.getByTestId("pb")).toHaveStyle({ height: "2px" });
  });
});

describe("ProgressSlider component", () => {
  it("renders slider and quick-set buttons", () => {
    const onChange = vi.fn();
    render(<ProgressSlider value={50} onChange={onChange} />);
    expect(screen.getByTestId("progress-slider")).toBeInTheDocument();
    expect(screen.getByTestId("quick-set-0")).toBeInTheDocument();
    expect(screen.getByTestId("quick-set-25")).toBeInTheDocument();
    expect(screen.getByTestId("quick-set-50")).toBeInTheDocument();
    expect(screen.getByTestId("quick-set-75")).toBeInTheDocument();
    expect(screen.getByTestId("quick-set-100")).toBeInTheDocument();
  });

  it("calls onChange when quick-set button clicked", async () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    render(<ProgressSlider value={0} onChange={onChange} onCommit={onCommit} />);
    await userEvent.click(screen.getByTestId("quick-set-75"));
    expect(onChange).toHaveBeenCalledWith(75);
    expect(onCommit).toHaveBeenCalledWith(75);
  });

  it("displays current percentage", () => {
    render(<ProgressSlider value={42} onChange={vi.fn()} />);
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});

describe("MilestoneList component", () => {
  const milestones: Milestone[] = [
    { id: "m1", label: "Beat Act 1", completed: false, completedAt: null },
    { id: "m2", label: "Beat Act 2", completed: true, completedAt: "2026-03-10T12:00:00Z" },
  ];

  it("renders all milestones", () => {
    render(<MilestoneList milestones={milestones} onChange={vi.fn()} />);
    expect(screen.getByTestId("milestone-m1")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-m2")).toBeInTheDocument();
  });

  it("toggles milestone completion", async () => {
    const onChange = vi.fn();
    render(<MilestoneList milestones={milestones} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("milestone-toggle-m1"));
    expect(onChange).toHaveBeenCalledTimes(1);
    const updated = onChange.mock.calls[0][0];
    expect(updated[0].completed).toBe(true);
    expect(updated[0].completedAt).toBeTruthy();
  });

  it("deletes a milestone", async () => {
    const onChange = vi.fn();
    render(<MilestoneList milestones={milestones} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("milestone-delete-m1"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    expect(onChange.mock.calls[0][0][0].id).toBe("m2");
  });

  it("adds a new milestone", async () => {
    const onChange = vi.fn();
    render(<MilestoneList milestones={[]} onChange={onChange} />);
    const input = screen.getByTestId("milestone-input");
    await userEvent.type(input, "New milestone");
    await userEvent.click(screen.getByTestId("milestone-add"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);
    expect(onChange.mock.calls[0][0][0].label).toBe("New milestone");
  });

  it("does not add empty milestone", async () => {
    const onChange = vi.fn();
    render(<MilestoneList milestones={[]} onChange={onChange} />);
    await userEvent.click(screen.getByTestId("milestone-add"));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("GameProgress component", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue({});
    useGameStore.setState({ games: [mockGame] });
  });

  it("shows 'Track Progress' button when no progress set", () => {
    render(<GameProgress game={mockGame} />);
    expect(screen.getByTestId("start-tracking-btn")).toBeInTheDocument();
  });

  it("shows progress bar when progress is set", () => {
    const gameWithProgress = { ...mockGame, progress: 42 };
    render(<GameProgress game={gameWithProgress} />);
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
    expect(screen.getByTestId("progress-percentage")).toHaveTextContent("42%");
  });

  it("shows edit button when progress is set", () => {
    const gameWithProgress = { ...mockGame, progress: 50 };
    render(<GameProgress game={gameWithProgress} />);
    expect(screen.getByTestId("edit-progress-btn")).toBeInTheDocument();
  });

  it("opens slider editor and hides display bar when edit clicked", async () => {
    const gameWithProgress = { ...mockGame, progress: 50 };
    render(<GameProgress game={gameWithProgress} />);
    expect(screen.getByTestId("progress-bar")).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("edit-progress-btn"));
    expect(screen.getByTestId("progress-slider")).toBeInTheDocument();
    expect(screen.queryByTestId("progress-bar")).not.toBeInTheDocument();
  });

  it("shows played vs HLTB and remaining when both progress and HLTB data available", () => {
    // 72000s = 20h played, HLTB main = 40h, so remaining = 20h
    const gameWithBoth = { ...mockGame, progress: 50, hltbMainH: 40, totalPlayTimeS: 72000 };
    render(<GameProgress game={gameWithBoth} />);
    const stats = screen.getByTestId("hltb-vs-playtime");
    expect(stats).toBeInTheDocument();
    expect(screen.getByTestId("progress-played")).toHaveTextContent("40.0h main story");
    expect(screen.getByTestId("hltb-remaining")).toHaveTextContent("~20.0h");
  });

  it("shows HLTB stats even while editing", async () => {
    const gameWithBoth = { ...mockGame, progress: 50, hltbMainH: 40, totalPlayTimeS: 3600 };
    render(<GameProgress game={gameWithBoth} />);
    await userEvent.click(screen.getByTestId("edit-progress-btn"));
    expect(screen.getByTestId("hltb-vs-playtime")).toBeInTheDocument();
    expect(screen.getByTestId("hltb-remaining")).toBeInTheDocument();
  });

  it("does not show HLTB stats when no HLTB data", () => {
    const gameWithProgress = { ...mockGame, progress: 50 };
    render(<GameProgress game={gameWithProgress} />);
    expect(screen.queryByTestId("hltb-vs-playtime")).not.toBeInTheDocument();
  });

  it("renders milestones from game data", async () => {
    const milestones = [
      { id: "m1", label: "Beat Act 1", completed: true, completedAt: "2026-03-10T12:00:00Z" },
      { id: "m2", label: "Beat Act 2", completed: false, completedAt: null },
    ];
    const gameWithMilestones = {
      ...mockGame,
      progress: 50,
      milestonesJson: JSON.stringify(milestones),
    };
    render(<GameProgress game={gameWithMilestones} />);
    await userEvent.click(screen.getByTestId("edit-progress-btn"));
    expect(screen.getByTestId("milestone-m1")).toBeInTheDocument();
    expect(screen.getByTestId("milestone-m2")).toBeInTheDocument();
  });
});

describe("GameCard progress bar", () => {
  beforeEach(() => {
    useSettingsStore.setState({ showCardProgress: true });
  });

  it("shows thin progress bar when progress > 0 and setting enabled", () => {
    const gameWithProgress = { ...mockGame, progress: 60 };
    useGameStore.setState({ games: [gameWithProgress] });
    render(<GameCard game={gameWithProgress} />);
    expect(screen.getByTestId("card-progress-g1")).toBeInTheDocument();
  });

  it("hides progress bar when progress is null", () => {
    useGameStore.setState({ games: [mockGame] });
    render(<GameCard game={mockGame} />);
    expect(screen.queryByTestId("card-progress-g1")).not.toBeInTheDocument();
  });

  it("hides progress bar when progress is 0", () => {
    const gameZero = { ...mockGame, progress: 0 };
    useGameStore.setState({ games: [gameZero] });
    render(<GameCard game={gameZero} />);
    expect(screen.queryByTestId("card-progress-g1")).not.toBeInTheDocument();
  });

  it("hides progress bar when setting disabled", () => {
    useSettingsStore.setState({ showCardProgress: false });
    const gameWithProgress = { ...mockGame, progress: 60 };
    useGameStore.setState({ games: [gameWithProgress] });
    render(<GameCard game={gameWithProgress} />);
    expect(screen.queryByTestId("card-progress-g1")).not.toBeInTheDocument();
  });
});
