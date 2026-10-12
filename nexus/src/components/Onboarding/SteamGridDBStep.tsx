import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  ExternalLinkText,
  HowToCard,
  KeySubmitButton,
  KeyVerifier,
  UiLabel,
  type VerifyState,
} from "./KeyVerifier";
import { StepFooter } from "./StepFooter";

const FORM_ID = "steamgriddb-form";

export function SteamGridDBStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);
  // Revisited from the rail after a key was saved: an empty field can just continue.
  const [alreadyDone] = React.useState(() =>
    useOnboardingStore.getState().completedSteps.includes("steamgriddb"),
  );
  const [apiKey, setApiKey] = React.useState("");
  const [verifyState, setVerifyState] = React.useState<VerifyState>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleVerify = React.useCallback(async () => {
    setVerifyState("verifying");
    setErrorMsg("");
    // Verification reads the saved key, so save first and put the old one back if it fails;
    // otherwise a mistyped key would stick and the step would count as done next launch.
    const prior = useSettingsStore.getState().apiKeys.steamGridDbKey;
    const restore = async () => {
      await invoke("set_setting", { key: "steamgrid_api_key", value: prior }).catch(() => {});
      setApiKeys({ steamGridDbKey: prior });
    };
    try {
      await invoke("set_setting", { key: "steamgrid_api_key", value: apiKey });
      setApiKeys({ steamGridDbKey: apiKey });
      const result = await invoke<{ valid: boolean; message: string }>(
        "verify_steamgrid_key",
      );
      if (result.valid) {
        setVerifyState("success");
      } else {
        await restore();
        setVerifyState("error");
        setErrorMsg(result.message);
      }
    } catch (err: unknown) {
      await restore();
      setVerifyState("error");
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
    }
  }, [apiKey, setApiKeys]);

  // Editing a checked key means it needs checking again.
  const handleChange = React.useCallback((value: string) => {
    setApiKey(value);
    setVerifyState((s) => (s === "success" || s === "error" ? "idle" : s));
    setErrorMsg("");
  }, []);

  const blank = !apiKey.trim();
  const canContinue = verifyState === "success" || (blank && alreadyDone);

  const handleSubmit = React.useCallback(() => {
    if (verifyState === "verifying") return;
    if (canContinue) goNext();
    else if (!blank) void handleVerify();
  }, [verifyState, canContinue, blank, goNext, handleVerify]);

  return (
    <div data-testid="steamgriddb-step" className="flex flex-col gap-4">
      <HowToCard
        testId="steamgriddb-instructions"
        duration="About 2 minutes"
        durationTestId="steamgriddb-difficulty"
        steps={[
          <>
            Sign in or create an account at{" "}
            <ExternalLinkText href="https://www.steamgriddb.com">steamgriddb.com</ExternalLinkText>.
          </>,
          <>
            Open <UiLabel>Preferences</UiLabel>, then <UiLabel>API</UiLabel>.
          </>,
          <>
            Select <UiLabel>Generate API Key</UiLabel>.
          </>,
          <>Copy the key and paste it below.</>,
        ]}
      />

      <KeyVerifier
        id={FORM_ID}
        testId="steamgriddb-key-area"
        fields={[
          {
            label: "API key",
            value: apiKey,
            onChange: handleChange,
            masked: true,
            noun: "key",
            placeholder: "Paste your SteamGridDB API key",
            testId: "steamgriddb-key",
          },
        ]}
        verifyState={verifyState}
        errorMessage={errorMsg}
        idleText={
          alreadyDone
            ? "Your key is already saved. Paste a new one to replace it."
            : "Paste your key, then press Enter to check it."
        }
        checkingText="Checking your key with SteamGridDB…"
        successText="Key verified. Artwork is ready to go."
        onSubmit={handleSubmit}
      />

      <StepFooter>
        <KeySubmitButton
          form={FORM_ID}
          testId="steamgriddb-next"
          verifyState={verifyState}
          verifyLabel="Verify key"
          canContinue={canContinue}
          disabled={blank && !canContinue}
        />
      </StepFooter>
    </div>
  );
}
