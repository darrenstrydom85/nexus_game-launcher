import { useEffect } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/**
 * Subscribe to a Tauri global event emitted from the Rust backend.
 * The listener is registered on mount and cleaned up on unmount.
 *
 * @param eventName - The event name to listen for (must match the Rust `app.emit(...)` call).
 * @param handler   - Callback receiving the typed payload.
 */
export function useTauriEvent<T>(
  eventName: string,
  handler: (payload: T) => void,
): void {
  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let cancelled = false;

    listen<T>(eventName, (event) => {
      if (!cancelled) {
        handler(event.payload);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [eventName, handler]);
}
