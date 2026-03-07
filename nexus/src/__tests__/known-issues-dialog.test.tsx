import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { KnownIssuesDialog } from "@/components/Settings/KnownIssuesDialog";
import { AboutSection } from "@/components/Settings/AboutSection";

const mockFetchKnownIssues = vi.fn();

vi.mock("@/lib/tauri", () => ({
  fetchKnownIssues: (...args: unknown[]) => mockFetchKnownIssues(...args),
}));

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.1.0")),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/stores/updateStore", () => ({
  useUpdateStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      updateAvailable: false,
      downloadUrl: "",
      latestVersion: null,
      runCheck: vi.fn(() => Promise.resolve()),
      dismissUpdatePopup: vi.fn(),
    }),
}));

describe("KnownIssuesDialog (Story 21.2)", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchKnownIssues.mockResolvedValue({ issues: [] });
  });

  it("renders nothing when closed", () => {
    render(<KnownIssuesDialog open={false} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders dialog with title and close button when open", async () => {
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Known Issues")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Close known issues dialog"),
    ).toBeInTheDocument();
  });

  it("shows skeleton loading state while fetching", () => {
    mockFetchKnownIssues.mockReturnValue(new Promise(() => {}));
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    expect(screen.getByTestId("known-issues-skeleton")).toBeInTheDocument();
  });

  it("renders issues as a list after fetch", async () => {
    mockFetchKnownIssues.mockResolvedValue({
      issues: ["Bug one", "Bug two"],
    });
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("Bug one")).toBeInTheDocument();
      expect(screen.getByText("Bug two")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Known issues list")).toBeInTheDocument();
  });

  it("shows empty state when no issues returned", async () => {
    mockFetchKnownIssues.mockResolvedValue({ issues: [] });
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId("known-issues-empty")).toBeInTheDocument();
      expect(
        screen.getByText(/no known issues right now/i),
      ).toBeInTheDocument();
    });
  });

  it("shows empty state on fetch error", async () => {
    mockFetchKnownIssues.mockRejectedValue(new Error("network"));
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId("known-issues-empty")).toBeInTheDocument();
    });
  });

  it("calls onClose when Escape is pressed", () => {
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button is clicked", () => {
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close known issues dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when backdrop is clicked", () => {
    render(<KnownIssuesDialog open={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("fetches fresh data each time dialog opens", async () => {
    mockFetchKnownIssues.mockResolvedValue({ issues: ["Issue A"] });
    const { rerender } = render(
      <KnownIssuesDialog open={true} onClose={onClose} />,
    );
    await waitFor(() => expect(screen.getByText("Issue A")).toBeInTheDocument());
    expect(mockFetchKnownIssues).toHaveBeenCalledTimes(1);

    rerender(<KnownIssuesDialog open={false} onClose={onClose} />);
    mockFetchKnownIssues.mockResolvedValue({ issues: ["Issue B"] });
    rerender(<KnownIssuesDialog open={true} onClose={onClose} />);
    await waitFor(() => expect(screen.getByText("Issue B")).toBeInTheDocument());
    expect(mockFetchKnownIssues).toHaveBeenCalledTimes(2);
  });
});

describe("AboutSection — Known Issues link (Story 21.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchKnownIssues.mockResolvedValue({ issues: [] });
  });

  it("renders a Known Issues link", async () => {
    render(<AboutSection />);
    await waitFor(() => {
      expect(screen.getByTestId("about-known-issues")).toBeInTheDocument();
      expect(screen.getByText("Known Issues")).toBeInTheDocument();
    });
  });

  it("opens the dialog when Known Issues link is clicked", async () => {
    render(<AboutSection />);
    fireEvent.click(screen.getByTestId("about-known-issues"));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(
        screen.getByLabelText("Close known issues dialog"),
      ).toBeInTheDocument();
    });
  });
});
