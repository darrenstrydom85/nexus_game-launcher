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

const FORM_ID = "igdb-form";

export function IGDBStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const setApiKeys = useSettingsStore((s) => s.setApiKeys);
  // Revisited from the rail after keys were saved: empty fields can just continue.
  const [alreadyDone] = React.useState(() =>
    useOnboardingStore.getState().completedSteps.includes("igdb"),
  );
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [verifyState, setVerifyState] = React.useState<VerifyState>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleVerify = React.useCallback(async () => {
    setVerifyState("verifying");
    setErrorMsg("");
    // Verification reads the saved keys, so save first and put the old ones back if it fails.
    const { igdbClientId: priorId, igdbClientSecret: priorSecret } = useSettingsStore.getState().apiKeys;
    const restore = async () => {
      await invoke("set_setting", { key: "igdb_client_id", value: priorId }).catch(() => {});
      await invoke("set_setting", { key: "igdb_client_secret", value: priorSecret }).catch(() => {});
      setApiKeys({ igdbClientId: priorId, igdbClientSecret: priorSecret });
    };
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
        await restore();
        setVerifyState("error");
        if (result.message.toLowerCase().includes("client id")) {
          setErrorMsg("That client ID wasn’t accepted. Check it in your Twitch developer console.");
        } else if (result.message.toLowerCase().includes("secret")) {
          setErrorMsg("That client secret wasn’t accepted. Generate a new one in the Twitch console.");
        } else if (result.message.toLowerCase().includes("unavailable") || result.message.toLowerCase().includes("timeout")) {
          setErrorMsg("Twitch isn’t responding right now. Try again in a moment.");
        } else {
          setErrorMsg(result.message);
        }
      }
    } catch (err: unknown) {
      await restore();
      setVerifyState("error");
      setErrorMsg(err instanceof Error ? err.message : "Verification failed");
    }
  }, [clientId, clientSecret, setApiKeys]);

  // Editing checked keys means they need checking again.
  const resetCheck = React.useCallback(() => {
    setVerifyState((s) => (s === "success" || s === "error" ? "idle" : s));
    setErrorMsg("");
  }, []);
  const handleIdChange = React.useCallback((v: string) => {
    setClientId(v);
    resetCheck();
  }, [resetCheck]);
  const handleSecretChange = React.useCallback((v: string) => {
    setClientSecret(v);
    resetCheck();
  }, [resetCheck]);

  const blank = !clientId.trim() && !clientSecret.trim();
  const incomplete = !clientId.trim() || !clientSecret.trim();
  const canContinue = verifyState === "success" || (blank && alreadyDone);

  const handleSubmit = React.useCallback(() => {
    if (verifyState === "verifying") return;
    if (canContinue) goNext();
    else if (!incomplete) void handleVerify();
  }, [verifyState, canContinue, incomplete, goNext, handleVerify]);

  return (
    <div data-testid="igdb-step" className="flex flex-col gap-4">
      <HowToCard
        testId="igdb-instructions"
        duration="About 5 minutes"
        durationTestId="igdb-difficulty"
        steps={[
          <>
            Sign in at <ExternalLinkText href="https://dev.twitch.tv">dev.twitch.tv</ExternalLinkText>.
          </>,
          <>
            Select <UiLabel>Register Your Application</UiLabel>.
          </>,
          <>Give it any name, for example Nexus.</>,
          <>
            Set the OAuth redirect URL to{" "}
            <code className="rounded bg-secondary px-1 py-px font-mono text-[12px] text-foreground">http://localhost</code>.
          </>,
          <>
            Choose the <UiLabel>Application Integration</UiLabel> category.
          </>,
          <>
            Select <UiLabel>Create</UiLabel>, then <UiLabel>Manage</UiLabel>.
          </>,
          <>Copy the client ID, then generate a client secret and copy that too.</>,
        ]}
      />

      <KeyVerifier
        id={FORM_ID}
        testId="igdb-key-area"
        fields={[
          {
            label: "Client ID",
            value: clientId,
            onChange: handleIdChange,
            placeholder: "Twitch client ID",
            testId: "igdb-client-id",
          },
          {
            label: "Client secret",
            value: clientSecret,
            onChange: handleSecretChange,
            masked: true,
            noun: "secret",
            placeholder: "Twitch client secret",
            testId: "igdb-client-secret",
          },
        ]}
        verifyState={verifyState}
        errorMessage={errorMsg}
        idleText={
          alreadyDone
            ? "Your keys are already saved. Paste new ones to replace them."
            : "Paste both values, then press Enter to check them."
        }
        checkingText="Checking your keys with Twitch…"
        successText="Keys verified. Game details are ready to go."
        onSubmit={handleSubmit}
      />

      <StepFooter>
        <KeySubmitButton
          form={FORM_ID}
          testId="igdb-next"
          verifyState={verifyState}
          verifyLabel="Verify keys"
          canContinue={canContinue}
          disabled={incomplete && !canContinue}
        />
      </StepFooter>
    </div>
  );
}
