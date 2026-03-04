import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { KeyVerifier, type VerifyState } from "./KeyVerifier";
import { Button } from "@/components/ui/button";

export function IGDBStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [verifyState, setVerifyState] = React.useState<VerifyState>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleVerify = React.useCallback(async () => {
    setVerifyState("verifying");
    setErrorMsg("");
    try {
      await invoke("set_setting", { key: "igdb_client_id", value: clientId });
      await invoke("set_setting", { key: "igdb_client_secret", value: clientSecret });
      setApiKeys({ igdbClientId: clientId, igdbClientSecret: clientSecret });
      const result = await invoke<{ valid: boolean; message: string }>(
        "verify_igdb_keys",
      );
      if (result.valid) {
        setVerifyState("success");
      } else {
        setVerifyState("error");
        if (result.message.toLowerCase().includes("client id")) {
          setErrorMsg("Invalid Client ID. Check your Twitch developer console.");
        } else if (result.message.toLowerCase().includes("secret")) {
          setErrorMsg("Invalid Client Secret. Regenerate it in the Twitch console.");
        } else if (result.message.toLowerCase().includes("unavailable") || result.message.toLowerCase().includes("timeout")) {
          setErrorMsg("Twitch API is temporarily unavailable. Try again later.");
        } else {
          setErrorMsg(result.message);
        }
      }
    } catch (err: unknown) {
      setVerifyState("error");
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
    }
  }, [clientId, clientSecret, setApiKeys]);


  return (
    <div data-testid="igdb-step" className="flex w-full max-w-3xl gap-8">
      {/* Left 60%: Instructions */}
      <div data-testid="igdb-instructions" className="flex w-[60%] flex-col gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-foreground">IGDB / Twitch API Keys</h2>
          <span data-testid="igdb-difficulty" className="rounded-full bg-warning/20 px-2.5 py-0.5 text-xs font-medium text-warning">
            Medium — 5 minutes
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          IGDB provides rich game metadata: descriptions, genres, release dates, and more.
        </p>
        <ol className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>
            1. Go to{" "}
            <a
              href="https://dev.twitch.tv"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary underline decoration-primary/50 underline-offset-2 outline-none transition-colors hover:text-primary/90 hover:decoration-primary focus:rounded focus:ring-2 focus:ring-ring"
            >
              dev.twitch.tv
            </a>{" "}
            and log in
          </li>
          <li>2. Click <strong>"Register Your Application"</strong></li>
          <li>3. Set app name to anything (e.g. "Nexus")</li>
          <li>4. Set OAuth redirect to <code className="rounded bg-secondary px-1">http://localhost</code></li>
          <li>5. Set category to <strong>"Application Integration"</strong></li>
          <li>6. Click <strong>"Create"</strong>, then <strong>"Manage"</strong></li>
          <li>7. Copy the <strong>Client ID</strong> and generate a <strong>Client Secret</strong></li>
        </ol>
      </div>

      {/* Right 40%: Key inputs */}
      <div data-testid="igdb-key-area" className="flex w-[40%] flex-col gap-4">
        <KeyVerifier
          label="Client ID"
          value={clientId}
          onChange={setClientId}
          masked={false}
          placeholder="Twitch Client ID"
          verifyState={verifyState === "success" ? "success" : "idle"}
          onVerify={() => {}}
          showVerifyButton={false}
          testId="igdb-client-id"
        />

        <KeyVerifier
          label="Client Secret"
          value={clientSecret}
          onChange={setClientSecret}
          masked
          placeholder="Twitch Client Secret"
          verifyState={verifyState}
          errorMessage={errorMsg}
          onVerify={handleVerify}
          testId="igdb-client-secret"
        />

        <Button
          data-testid="igdb-next"
          disabled={verifyState !== "success"}
          onClick={goNext}
        >
          Continue
        </Button>

      </div>
    </div>
  );
}
