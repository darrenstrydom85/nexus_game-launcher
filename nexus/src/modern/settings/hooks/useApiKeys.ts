import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, type ApiKeys } from "@/stores/settingsStore";

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

/** First and last four characters around a fixed run of dots, so the length never leaks. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)} •••••••••••• ${key.slice(-4)}`;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Something went wrong";
}

/** API keys from the settings store, with save (then verify) and remove. */
export function useApiKeys() {
  const apiKeys = useSettingsStore((s) => s.apiKeys);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);
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
   * in the background. Rejects if the write fails.
   */
  const save = React.useCallback(
    async (provider: KeyProvider, keys: Partial<ApiKeys>) => {
      const trimmed = Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, (v ?? "").trim()])) as Partial<ApiKeys>;
      // Await the writes so the verify command reads the new values.
      for (const [k, v] of Object.entries(trimmed)) {
        await invoke("set_setting", { key: SETTING_KEYS[k as keyof ApiKeys], value: v });
      }
      setApiKeys(trimmed);
      void verify(provider);
    },
    [setApiKeys, verify],
  );

  const remove = React.useCallback(
    (provider: KeyProvider) => {
      runs.current[provider]++;
      setCheck(provider, undefined);
      setApiKeys(CLEARED[provider]);
    },
    [setApiKeys, setCheck],
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
