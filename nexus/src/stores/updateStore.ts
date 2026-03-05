import { create } from "zustand";
import { checkUpdateAvailable, type UpdateCheckResult } from "@/lib/tauri";

export interface UpdateState {
  /** True when a newer version is available than the running app. */
  updateAvailable: boolean;
  /** Latest version string from JSONBin (e.g. "0.1.6"). */
  latestVersion: string | null;
  /** URL to open for download (rebrand.ly/nexus-launch). */
  downloadUrl: string;
  /** Whether the one-time popup on app load has been dismissed this session. */
  popupDismissed: boolean;
}

export interface UpdateActions {
  setUpdateResult: (result: UpdateCheckResult) => void;
  dismissUpdatePopup: () => void;
  runCheck: () => Promise<void>;
}

const DEFAULT_DOWNLOAD_URL = "https://rebrand.ly/nexus-launch";

export const useUpdateStore = create<UpdateState & UpdateActions>((set) => ({
  updateAvailable: false,
  latestVersion: null,
  downloadUrl: DEFAULT_DOWNLOAD_URL,
  popupDismissed: false,

  setUpdateResult: (result) =>
    set({
      updateAvailable: result.updateAvailable,
      latestVersion: result.latestVersion ?? null,
      downloadUrl: result.downloadUrl || DEFAULT_DOWNLOAD_URL,
    }),

  dismissUpdatePopup: () => set({ popupDismissed: true }),

  runCheck: async () => {
    try {
      const result = await checkUpdateAvailable();
      set({
        updateAvailable: result.updateAvailable,
        latestVersion: result.latestVersion ?? null,
        downloadUrl: result.downloadUrl || DEFAULT_DOWNLOAD_URL,
      });
    } catch {
      // Silent: no network or JSONBin unreachable — don't bother the user
    }
  },
}));
