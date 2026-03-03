import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastNotifications } from "@/components/shared/ToastNotifications";
import { useToastStore } from "@/stores/toastStore";

describe("Story 5.7: Toast Notification System", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the toast container", () => {
    render(<ToastNotifications />);
    expect(screen.getByTestId("toast-container")).toBeInTheDocument();
  });

  it("container has aria-live='polite' for accessibility", () => {
    render(<ToastNotifications />);
    expect(screen.getByTestId("toast-container")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });

  it("container is positioned fixed bottom-right", () => {
    render(<ToastNotifications />);
    const container = screen.getByTestId("toast-container");
    expect(container.className).toContain("fixed");
    expect(container.className).toContain("bottom-4");
    expect(container.className).toContain("right-4");
  });

  it("stacks toasts vertically", () => {
    render(<ToastNotifications />);
    const container = screen.getByTestId("toast-container");
    expect(container.className).toContain("flex");
    expect(container.className).toContain("flex-col-reverse");
  });

  it("renders a success toast", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "success",
        message: "Operation succeeded",
      });
    });
    const toast = screen.getByText("Operation succeeded");
    expect(toast).toBeInTheDocument();
  });

  it("renders an error toast", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "error",
        message: "Something went wrong",
      });
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders a warning toast", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "warning",
        message: "Be careful",
      });
    });
    expect(screen.getByText("Be careful")).toBeInTheDocument();
  });

  it("renders an info toast", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "info",
        message: "FYI notice",
      });
    });
    expect(screen.getByText("FYI notice")).toBeInTheDocument();
  });

  it("toast has glassmorphism styling class", () => {
    render(<ToastNotifications />);
    let toastId: string;
    act(() => {
      toastId = useToastStore.getState().addToast({
        type: "info",
        message: "Glass toast",
      });
    });
    const toastEl = screen.getByTestId(`toast-${toastId!}`);
    expect(toastEl.className).toContain("glass-toast");
  });

  it("auto-dismisses after default 5s duration", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "info",
        message: "Auto dismiss me",
      });
    });
    expect(screen.getByText("Auto dismiss me")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("auto-dismisses after custom duration", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "info",
        message: "Quick toast",
        duration: 2000,
      });
    });
    expect(screen.getByText("Quick toast")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("manual dismiss via close button", () => {
    render(<ToastNotifications />);
    let toastId: string;
    act(() => {
      toastId = useToastStore.getState().addToast({
        type: "info",
        message: "Dismiss me",
      });
    });

    const dismissBtn = screen.getByTestId(`toast-dismiss-${toastId!}`);
    expect(dismissBtn).toHaveAttribute("aria-label", "Dismiss notification");
    fireEvent.click(dismissBtn);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("renders action button when provided", () => {
    const actionFn = vi.fn();
    render(<ToastNotifications />);
    let toastId: string;
    act(() => {
      toastId = useToastStore.getState().addToast({
        type: "error",
        message: "Failed to save",
        action: { label: "Try Again", onClick: actionFn },
      });
    });

    const actionBtn = screen.getByTestId(`toast-action-${toastId!}`);
    expect(actionBtn).toHaveTextContent("Try Again");
    fireEvent.click(actionBtn);
    expect(actionFn).toHaveBeenCalledOnce();
  });

  it("renders Undo action button", () => {
    const undoFn = vi.fn();
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({
        type: "success",
        message: "Item deleted",
        action: { label: "Undo", onClick: undoFn },
      });
    });
    const undoBtn = screen.getByText("Undo");
    fireEvent.click(undoBtn);
    expect(undoFn).toHaveBeenCalledOnce();
  });

  it("multiple toasts stack vertically", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({ type: "info", message: "First" });
      useToastStore.getState().addToast({ type: "success", message: "Second" });
      useToastStore.getState().addToast({ type: "error", message: "Third" });
    });
    expect(useToastStore.getState().toasts).toHaveLength(3);
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("Third")).toBeInTheDocument();
  });

  it("clearToasts removes all toasts", () => {
    render(<ToastNotifications />);
    act(() => {
      useToastStore.getState().addToast({ type: "info", message: "A" });
      useToastStore.getState().addToast({ type: "info", message: "B" });
    });
    expect(useToastStore.getState().toasts).toHaveLength(2);

    act(() => {
      useToastStore.getState().clearToasts();
    });
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("toast has data-toast-type attribute", () => {
    render(<ToastNotifications />);
    let toastId: string;
    act(() => {
      toastId = useToastStore.getState().addToast({
        type: "warning",
        message: "Typed toast",
      });
    });
    const toastEl = screen.getByTestId(`toast-${toastId!}`);
    expect(toastEl).toHaveAttribute("data-toast-type", "warning");
  });
});
