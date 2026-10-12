import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { errorMessage } from "@/lib/utils";
import { useSettingsStore, type ApiKeys } from "@/stores/settingsStore";
import { useToastStore } from "@/stores/toastStore";

export type KeyProvider = "steamgrid" | "igdb";

export type KeyCheck = { state: "checking" } | { state: "valid" } | { state: "invalid"; message: string };

const SETTING_KEYS: Record<keyof ApiKeys, string> = {
  steamGridDbKey: "steamgrid_api_key",
  igdbClientId: "igdb_client_id",
  igdbClientSecret: "igdb_client_secret",
};

const VERIFY_COMMANDS: Record<KeyProvider, string> = {
  steamgrid: "verify_steamgrid_key",
  igdb: "verify_igdb_keys",
};

const CLEARED: Record<KeyProvider, Partial<ApiKeys>> = {
  steamgrid: { steamGridDbKey: "" },
  igdb: { igdbClientId: "", igdbClientSecret: "" },
};

const KEY_NAMES: Record<KeyProvider, string> = {
  steamgrid: "SteamGridDB key",
  igdb: "IGDB keys",
};

/**
 * Writes each key to the database, then puts it in the store as that write
 * lands, so the two never disagree. The store's own `setApiKeys` would write
 * a second time, so this sets the state directly. Rejects on the first failed write.
 */
async function writeKeys(keys: Partial<ApiKeys>) {
  for (const [k, v] of Object.entries(keys) as [keyof ApiKeys, string][]) {
    await invoke("set_setting", { key: SETTING_KEYS[k], value: v });
    useSettingsStore.setState((s) => ({ apiKeys: { ...s.apiKeys, [k]: v } }));
  }
}

/** First and last four characters around a fixed run of dots, so the length never leaks. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)} •••••••••••• ${key.slice(-4)}`;
}

/** API keys from the settings store, with save (then verify) and remove. */
export function useApiKeys() {
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const [checks, setChecks] = React.useState<Partial<Record<KeyProvider, KeyCheck>>>({});
  // Drops a verify result that lands after a newer save or a remove.
  const runs = React.useRef<Record<KeyProvider, number>>({ steamgrid: 0, igdb: 0 });

  const setCheck = React.useCallback((provider: KeyProvider, check: KeyCheck | undefined) => {
    setChecks((prev) => ({ ...prev, [provider]: check }));
  }, []);

  const verify = React.useCallback(
    async (provider: KeyProvider) => {
      const run = ++runs.current[provider];
      setCheck(provider, { state: "checking" });
      try {
        const res = await invoke<{ valid: boolean; message: string } | null>(VERIFY_COMMANDS[provider]);
        if (run !== runs.current[provider]) return;
        setCheck(provider, res?.valid ? { state: "valid" } : { state: "invalid", message: res?.message || "The key was rejected" });
      } catch (err) {
        if (run !== runs.current[provider]) return;
        setCheck(provider, { state: "invalid", message: errorMessage(err) });
      }
    },
    [setCheck],
  );

  /**
   * Writes the keys and updates the store, then checks them with the provider
   * in the background. Rejects if a write fails.
   */
  const save = React.useCallback(
    async (provider: KeyProvider, keys: Partial<ApiKeys>) => {
      const trimmed = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, (v ?? "").trim()])) as Partial<ApiKeys>;
      // Await the writes so the verify command reads the new values.
      await writeKeys(trimmed);
      void verify(provider);
    },
    [verify],
  );

  /** Clears the provider's keys. Keeps them, with an error toast, if the write fails. */
  const remove = React.useCallback(
    async (provider: KeyProvider) => {
      try {
        await writeKeys(CLEARED[provider]);
      } catch {
        useToastStore.getState().addToast({ type: "error", message: `Couldn’t remove your ${KEY_NAMES[provider]}. Please try again.` });
        return;
      }
      runs.current[provider]++;
      setCheck(provider, undefined);
    },
    [setCheck],
  );

  return { apiKeys, checks, save, remove };
}

/** Re-runs first-time setup on the next load. Steps for keys already saved are skipped. */
export async function runSetupWizard(reload: () => void = () => window.location.reload()) {
  try {
    // Wait for the write: reloading first can drop the IPC call.
    await invoke("set_setting", { key: "onboarding_completed", value: "false" });
  } catch {
    // best-effort, as before
  }
  reload();
}
