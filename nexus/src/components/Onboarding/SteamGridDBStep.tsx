import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { KeyVerifier, type VerifyState } from "./KeyVerifier";
import { Button } from "@/components/ui/button";

export function SteamGridDBStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);
  const [apiKey, setApiKey] = React.useState("");
  const [verifyState, setVerifyState] = React.useState<VerifyState>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleVerify = React.useCallback(async () => {
    setVerifyState("verifying");
    setErrorMsg("");
    try {
      await invoke("set_setting", { key: "steamgrid_api_key", value: apiKey });
      setApiKeys({ steamGridDbKey: apiKey });
      const result = await invoke<{ valid: boolean; message: string }>(
        "verify_steamgrid_key",
      );
      if (result.valid) {
        setVerifyState("success");
      } else {
        setVerifyState("error");
        setErrorMsg(result.message);
      }
    } catch (err: unknown) {
      setVerifyState("error");
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
    }
  }, [apiKey, setApiKeys]);


  const handleNext = React.useCallback(() => {
    goNext();
  }, [goNext]);

  return (
    <div data-testid="steamgriddb-step" className="flex w-full max-w-3xl gap-8">
      {/* Left 60%: Instructions */}
      <div data-testid="steamgriddb-instructions" className="flex w-[60%] flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">SteamGridDB API Key</h2>
          <span data-testid="steamgriddb-difficulty" className="rounded-full bg-success/20 px-2.5 py-0.5 text-xs font-medium text-success">
            Easy — 2 minutes
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          SteamGridDB provides high-quality cover art, hero images, and logos for your games.
        </p>
        <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>
            1. Go to{" "}
            <a
              href="https://www.steamgriddb.com"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline decoration-primary/50 underline-offset-2 outline-none transition-colors hover:text-primary/90 hover:decoration-primary focus:rounded focus:ring-2 focus:ring-ring"
            >
              steamgriddb.com
            </a>{" "}
            and create an account
          </li>
          <li>2. Navigate to <strong>Preferences → API</strong></li>
          <li>3. Click <strong>"Generate API Key"</strong></li>
          <li>4. Copy the key and paste it here</li>
        </ol>
      </div>

      {/* Right 40%: Key input */}
      <div data-testid="steamgriddb-key-area" className="flex w-[40%] flex-col gap-4">
        <KeyVerifier
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          masked
          placeholder="Paste your SteamGridDB API key"
          verifyState={verifyState}
          errorMessage={errorMsg}
          onVerify={handleVerify}
          testId="steamgriddb-key"
        />

        <Button
          data-testid="steamgriddb-next"
          disabled={verifyState !== "success"}
          onClick={handleNext}
        >
          Continue
        </Button>

      </div>
    </div>
  );
}
