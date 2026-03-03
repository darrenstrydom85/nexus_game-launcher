import * as React from "react";

export interface GridNavOptions {
  columns: number;
  totalItems: number;
  onSelect?: (index: number) => void;
}

export function useGridKeyboardNav({ columns, totalItems, onSelect }: GridNavOptions) {
  const [focusIndex, setFocusIndex] = React.useState(0);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      let next = focusIndex;
      switch (e.key) {
        case "ArrowRight":
          next = Math.min(focusIndex + 1, totalItems - 1);
          break;
        case "ArrowLeft":
          next = Math.max(focusIndex - 1, 0);
          break;
        case "ArrowDown":
          next = Math.min(focusIndex + columns, totalItems - 1);
          break;
        case "ArrowUp":
          next = Math.max(focusIndex - columns, 0);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          onSelect?.(focusIndex);
          return;
        case "Home":
          next = 0;
          break;
        case "End":
          next = totalItems - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      setFocusIndex(next);
    },
    [focusIndex, columns, totalItems, onSelect],
  );

  return { focusIndex, setFocusIndex, handleKeyDown };
}

export function useGlobalShortcuts(shortcuts: Record<string, () => void>) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = [
        e.ctrlKey ? "Ctrl" : "",
        e.shiftKey ? "Shift" : "",
        e.key,
      ].filter(Boolean).join("+");

      const action = shortcuts[key];
      if (action) {
        e.preventDefault();
        action();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
