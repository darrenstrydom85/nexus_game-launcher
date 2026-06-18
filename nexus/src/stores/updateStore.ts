import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

/**
 * Lifecycle of an in-app update:
 *  idle        — no update known (or check found nothing).
 *  checking    — a check() call is in flight.
 *  available   — a newer version was found and is ready to download.
 *  downloading — the installer is being downloaded + applied.
 *  ready       — download + install finished; a restart applies it.
 *  error       — download/install failed.
 */
export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface UpdateState {
  /** True when a newer version is available than the running app. */
  updateAvailable: boolean;
  /** Latest version string reported by the updater manifest (e.g. "0.4.3"). */
  latestVersion: string | null;
  /** Release notes from the manifest, if any. */
  notes: string | null;
  /** Current phase of the update lifecycle. */
  phase: UpdatePhase;
  /** Bytes downloaded so far during the `downloading` phase. */
  downloadedBytes: number;
  /** Total bytes to download (0 until the download starts). */
  totalBytes: number;
  /** Whether the one-time popup on app load has been dismissed this session. */
  popupDismissed: boolean;
}

export interface UpdateActions {
  /** Check the updater endpoint for a newer signed release. Silent on failure. */
  runCheck: () => Promise<void>;
  /** Download and install the pending update, tracking progress. */
  downloadAndInstall: () => Promise<void>;
  /** Relaunch the app so the installed update takes effect. */
  restart: () => Promise<void>;
  /** Mark the on-load popup as dismissed for this session. */
  dismissUpdatePopup: () => void;
}

/**
 * The pending `Update` handle lives outside the store: it's a non-serialisable
 * plugin object that nothing should subscribe to or render. The store only
 * mirrors the derived, render-relevant fields.
 */
let pendingUpdate: Update | null = null;

export const useUpdateStore = create<UpdateState & UpdateActions>((set, get) => ({
  updateAvailable: false,
  latestVersion: null,
  notes: null,
  phase: "idle",
  downloadedBytes: 0,
  totalBytes: 0,
  popupDismissed: false,

  dismissUpdatePopup: () => set({ popupDismissed: true }),

  runCheck: async () => {
    // Don't interrupt an in-progress download with a periodic re-check.
    if (get().phase === "downloading" || get().phase === "ready") return;
    set({ phase: "checking" });
    try {
      const update = await check();
      if (update) {
        pendingUpdate = update;
        set({
          updateAvailable: true,
          latestVersion: update.version,
          notes: update.body ?? null,
          phase: "available",
        });
      } else {
        pendingUpdate = null;
        set({ updateAvailable: false, latestVersion: null, notes: null, phase: "idle" });
      }
    } catch {
      // Silent: offline, endpoint unreachable, or updater not configured —
      // don't bother the user, just leave the UI in its current state.
      set({ phase: get().updateAvailable ? "available" : "idle" });
    }
  },

  downloadAndInstall: async () => {
    if (!pendingUpdate) return;
    set({ phase: "downloading", downloadedBytes: 0, totalBytes: 0 });
    try {
      let downloaded = 0;
      await pendingUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            set({ totalBytes: event.data.contentLength ?? 0 });
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            set({ downloadedBytes: downloaded });
            break;
          case "Finished":
            set({ phase: "ready" });
            break;
        }
      });
      set({ phase: "ready" });
    } catch {
      set({ phase: "error" });
    }
  },

  restart: async () => {
    await relaunch();
  },
}));
