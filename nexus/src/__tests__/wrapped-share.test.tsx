import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { WrappedReport } from "@/types/wrapped";
import { WrappedShareCard } from "@/components/Wrapped/WrappedShareCard";
import { WrappedShareModal, formatWrappedStatsText } from "@/components/Wrapped/WrappedShareModal";

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("html-to-image", () => ({
  toPng: vi.fn(() => Promise.resolve("data:image/png;base64,AAAA")),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(() => Promise.resolve("/tmp/nexus-wrapped-2025.png")),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  writeFile: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tauri-apps/api/core")>();
  return {
    ...actual,
    invoke: vi.fn(() => Promise.resolve()),
    convertFileSrc: (p: string) => p,
  };
});

vi.mock("@/stores/toastStore", () => ({
  useToastStore: (selector: (s: { addToast: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ addToast: vi.fn() }),
}));

vi.mock("@/stores/settingsStore", () => ({
  useSettingsStore: (selector: (s: { accentColor: string }) => unknown) =>
    selector({ accentColor: "#7600da" }),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────

const mockReport: WrappedReport = {
  periodLabel: "2025",
  totalPlayTimeS: 360000,
  totalSessions: 42,
  totalGamesPlayed: 15,
  totalGamesInLibrary: 120,
  newGamesAdded: 8,
  newTitlesInPeriod: 5,
  mostPlayedGame: {
    id: "g1",
    name: "Cyberpunk 2077",
    coverUrl: null,
    heroUrl: null,
    logoUrl: null,
    playTimeS: 180000,
    sessionCount: 20,
    source: "steam",
  },
  mostPlayedGenre: "RPG",
  topGames: [
    { id: "g1", name: "Cyberpunk 2077", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 180000, sessionCount: 20, source: "steam" },
    { id: "g2", name: "Elden Ring", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 90000, sessionCount: 12, source: "steam" },
    { id: "g3", name: "Hades", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 54000, sessionCount: 8, source: "epic" },
  ],
  genreBreakdown: [{ name: "RPG", playTimeS: 270000, percent: 75 }],
  genreTagline: "You're a true adventurer",
  platformBreakdown: [{ source: "steam", playTimeS: 270000, percent: 75 }],
  longestSession: { gameId: "g1", gameName: "Cyberpunk 2077", startedAt: "2025-06-15T20:00:00Z", durationS: 28800 },
  longestStreakDays: 7,
  busiestDay: "2025-06-15",
  busiestDayPlayTimeS: 28800,
  firstGamePlayed: { id: "g3", name: "Hades", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 54000, sessionCount: 8, source: "epic" },
  lastGamePlayed: { id: "g1", name: "Cyberpunk 2077", coverUrl: null, heroUrl: null, logoUrl: null, playTimeS: 180000, sessionCount: 20, source: "steam" },
  playTimeByMonth: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, playTimeS: i * 3600 })),
  playTimeByDayOfWeek: Array.from({ length: 7 }, (_, i) => ({ day: i, playTimeS: i * 3600 })),
  playTimeByHourOfDay: Array.from({ length: 24 }, (_, i) => ({ hour: i, playTimeS: i * 600 })),
  funFacts: [{ kind: "marathons", value: 25, label: "That's equivalent to 25 marathons" }],
  comparisonPreviousPeriod: { previousTotalS: 300000, percentChange: 20, label: "Up 20% from last year" },
  moodTagline: "Mostly chill vibes",
  hiddenGem: { gameId: "g3", name: "Hades", playTimeS: 54000, rating: 65, tagline: "A hidden gem in your library" },
  trivia: ["Your top game has a 90% rating"],
};

// ── WrappedShareCard ────────────────────────────────────────────────────────

describe("WrappedShareCard", () => {
  it("renders with mock data", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByTestId("wrapped-share-card")).toBeInTheDocument();
  });

  it("renders total hours prominently", () => {
    render(<WrappedShareCard report={mockReport} />);
    // 360000s = 100h
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders period label in header", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText(/2025 in Gaming/i)).toBeInTheDocument();
  });

  it("renders top 3 games", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText("Cyberpunk 2077")).toBeInTheDocument();
    expect(screen.getByText("Elden Ring")).toBeInTheDocument();
    expect(screen.getByText("Hades")).toBeInTheDocument();
  });

  it("renders most played genre in highlights", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText("RPG")).toBeInTheDocument();
  });

  it("renders longest streak in highlights", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText(/7 day/i)).toBeInTheDocument();
  });

  it("renders epic binge milestone", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText(/Epic Binge/i)).toBeInTheDocument();
    // The binge tile shows "Xh — GameName" format
    expect(screen.getByText(/8h — Cyberpunk 2077/i)).toBeInTheDocument();
  });

  it("renders busiest day milestone", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText(/Busiest Day/i)).toBeInTheDocument();
  });

  it("renders highlights section label", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText(/Highlights/i)).toBeInTheDocument();
  });

  it("renders fun fact when present", () => {
    render(<WrappedShareCard report={mockReport} />);
    expect(screen.getByText(/25 marathons/i)).toBeInTheDocument();
  });

  it("does not render fun fact section when funFacts is empty", () => {
    render(<WrappedShareCard report={{ ...mockReport, funFacts: [] }} />);
    expect(screen.queryByText(/marathons/i)).not.toBeInTheDocument();
  });

  it("renders with a different period label", () => {
    render(<WrappedShareCard report={{ ...mockReport, periodLabel: "March 2025" }} />);
    expect(screen.getByText(/March 2025 in Gaming/i)).toBeInTheDocument();
  });
});

// ── formatWrappedStatsText ──────────────────────────────────────────────────

describe("formatWrappedStatsText", () => {
  it("produces correct output for full report", () => {
    const text = formatWrappedStatsText(mockReport);
    expect(text).toContain("My 2025 in Gaming");
    expect(text).toContain("100h");
    expect(text).toContain("15 games");
    expect(text).toContain("Cyberpunk 2077");
    expect(text).toContain("50h");
    expect(text).toContain("RPG");
    expect(text).toContain("7 days");
  });

  it("omits most played game line when absent", () => {
    const text = formatWrappedStatsText({ ...mockReport, mostPlayedGame: null });
    expect(text).not.toContain("Most played:");
  });

  it("omits genre line when absent", () => {
    const text = formatWrappedStatsText({ ...mockReport, mostPlayedGenre: null });
    expect(text).not.toContain("Top genre:");
  });

  it("omits streak line when zero", () => {
    const text = formatWrappedStatsText({ ...mockReport, longestStreakDays: 0 });
    expect(text).not.toContain("Longest streak:");
  });

  it("uses period label from report", () => {
    const text = formatWrappedStatsText({ ...mockReport, periodLabel: "March 2025" });
    expect(text).toContain("My March 2025 in Gaming");
  });

  it("produces no more than 4 lines", () => {
    const text = formatWrappedStatsText(mockReport);
    const sentences = text.split(". ").filter(Boolean);
    expect(sentences.length).toBeLessThanOrEqual(5);
  });
});

// ── WrappedShareModal ───────────────────────────────────────────────────────

describe("WrappedShareModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the modal", () => {
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    expect(screen.getByTestId("wrapped-share-modal")).toBeInTheDocument();
  });

  it("shows loading state while generating", () => {
    // toPng is mocked to resolve asynchronously — initial state is generating
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    expect(screen.getByTestId("share-generating-state")).toBeInTheDocument();
    expect(screen.getByText(/Generating image/i)).toBeInTheDocument();
  });

  it("download button is disabled during generation", () => {
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    expect(screen.getByTestId("share-download-button")).toBeDisabled();
  });

  it("copy image button is disabled during generation", () => {
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    expect(screen.getByTestId("share-copy-image-button")).toBeDisabled();
  });

  it("shows preview image after generation completes", async () => {
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("share-preview-image")).toBeInTheDocument();
    });
    expect(screen.getByTestId("share-preview-image")).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
  });

  it("enables download button after generation", async () => {
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId("share-download-button")).not.toBeDisabled();
    });
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<WrappedShareModal report={mockReport} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("share-modal-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<WrappedShareModal report={mockReport} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("share-modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("copy stats button is always enabled", () => {
    render(<WrappedShareModal report={mockReport} onClose={vi.fn()} />);
    expect(screen.getByTestId("share-copy-text-button")).not.toBeDisabled();
  });
});
