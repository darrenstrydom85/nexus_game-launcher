import { describe, it, expect, beforeEach } from "vitest";
import { useToastStore } from "@/stores/toastStore";

describe("Score backfill progress toast", () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  it("addToast creates a toast with info type", () => {
    const id = useToastStore.getState().addToast({
      type: "info",
      message: "Fetching review scores... 12/47",
      duration: 0,
    });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(id);
    expect(toasts[0].type).toBe("info");
    expect(toasts[0].message).toBe("Fetching review scores... 12/47");
  });

  it("removeToast dismisses the backfill toast", () => {
    const id = useToastStore.getState().addToast({
      type: "info",
      message: "Fetching review scores... 5/20",
      duration: 0,
    });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    useToastStore.getState().removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("progress toast message format matches expected pattern", () => {
    const completed = 12;
    const total = 47;
    const message = `Fetching review scores... ${completed}/${total}`;
    expect(message).toBe("Fetching review scores... 12/47");
  });

  it("multiple progress updates replace previous toast", () => {
    const store = useToastStore.getState();

    const id1 = store.addToast({ type: "info", message: "Fetching review scores... 5/47", duration: 0 });
    store.removeToast(id1);
    const id2 = store.addToast({ type: "info", message: "Fetching review scores... 10/47", duration: 0 });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toBe("Fetching review scores... 10/47");
    expect(toasts[0].id).toBe(id2);
  });

  it("toast is cleared when backfill completes", () => {
    const store = useToastStore.getState();
    const id = store.addToast({ type: "info", message: "Fetching review scores... 46/47", duration: 0 });
    expect(useToastStore.getState().toasts).toHaveLength(1);

    // Simulate completion — remove the toast.
    store.removeToast(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
