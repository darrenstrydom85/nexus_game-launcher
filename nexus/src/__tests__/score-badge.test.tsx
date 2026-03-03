import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreBadge } from "@/components/shared/ScoreBadge";

describe("ScoreBadge", () => {
  // ── Color threshold rendering ──

  it("renders green class for score >= 75", () => {
    render(<ScoreBadge score={75} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-success");
  });

  it("renders green class for score 100", () => {
    render(<ScoreBadge score={100} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-success");
  });

  it("renders yellow class for score 50", () => {
    render(<ScoreBadge score={50} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-warning");
  });

  it("renders yellow class for score 74", () => {
    render(<ScoreBadge score={74} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-warning");
  });

  it("renders red class for score 49", () => {
    render(<ScoreBadge score={49} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-destructive");
  });

  it("renders red class for score 0", () => {
    render(<ScoreBadge score={0} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-destructive");
  });

  // ── Score rounding ──

  it("rounds score to nearest integer for display", () => {
    render(<ScoreBadge score={87.6} size="sm" />);
    expect(screen.getByTestId("score-badge-sm").textContent).toBe("88");
  });

  it("rounds score down correctly", () => {
    render(<ScoreBadge score={74.2} size="sm" />);
    expect(screen.getByTestId("score-badge-sm").textContent).toBe("74");
  });

  // ── Size variants ──

  it("renders sm size with correct test id", () => {
    render(<ScoreBadge score={80} size="sm" />);
    expect(screen.getByTestId("score-badge-sm")).toBeTruthy();
    expect(screen.queryByTestId("score-badge-md")).toBeNull();
  });

  it("renders md size with correct test id", () => {
    render(<ScoreBadge score={80} size="md" />);
    expect(screen.getByTestId("score-badge-md")).toBeTruthy();
    expect(screen.queryByTestId("score-badge-sm")).toBeNull();
  });

  it("defaults to md size", () => {
    render(<ScoreBadge score={80} />);
    expect(screen.getByTestId("score-badge-md")).toBeTruthy();
  });

  // ── Review count display ──

  it("shows review count in md size when provided", () => {
    render(<ScoreBadge score={80} size="md" count={42} />);
    expect(screen.getByText(/42 reviews/)).toBeTruthy();
  });

  it("shows singular 'review' for count of 1", () => {
    render(<ScoreBadge score={80} size="md" count={1} />);
    expect(screen.getByText(/1 review/)).toBeTruthy();
  });

  it("abbreviates large counts with k suffix", () => {
    render(<ScoreBadge score={80} size="md" count={1500} />);
    expect(screen.getByText(/1\.5k reviews/)).toBeTruthy();
  });

  it("does not show count text when count is not provided", () => {
    render(<ScoreBadge score={80} size="md" />);
    expect(screen.queryByText(/reviews/)).toBeNull();
  });

  // ── Accessibility ──

  it("has aria-label describing score context", () => {
    render(<ScoreBadge score={87} size="md" label="Critic score" count={42} />);
    const badge = screen.getByTestId("score-badge-md");
    expect(badge.getAttribute("aria-label")).toContain("Critic score");
    expect(badge.getAttribute("aria-label")).toContain("87 out of 100");
    expect(badge.getAttribute("aria-label")).toContain("42 reviews");
  });

  it("has aria-label without count when count is absent", () => {
    render(<ScoreBadge score={75} size="sm" label="Community score" />);
    const badge = screen.getByTestId("score-badge-sm");
    const label = badge.getAttribute("aria-label") ?? "";
    expect(label).toContain("Community score");
    expect(label).toContain("75 out of 100");
    expect(label).not.toContain("reviews");
  });

  // ── Boundary values ──

  it("boundary: score 74 is yellow not green", () => {
    render(<ScoreBadge score={74} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-warning");
    expect(badge.className).not.toContain("text-success");
  });

  it("boundary: score 75 is green not yellow", () => {
    render(<ScoreBadge score={75} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-success");
    expect(badge.className).not.toContain("text-warning");
  });

  it("boundary: score 49 is red not yellow", () => {
    render(<ScoreBadge score={49} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-destructive");
    expect(badge.className).not.toContain("text-warning");
  });

  it("boundary: score 50 is yellow not red", () => {
    render(<ScoreBadge score={50} size="sm" />);
    const badge = screen.getByTestId("score-badge-sm");
    expect(badge.className).toContain("text-warning");
    expect(badge.className).not.toContain("text-destructive");
  });
});
