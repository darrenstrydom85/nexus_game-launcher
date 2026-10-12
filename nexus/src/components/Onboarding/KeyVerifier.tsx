import * as React from "react";
import { ArrowRight, CheckCircle2, ExternalLink, Eye, EyeOff, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOOTER_PRIMARY } from "./StepFooter";

export type VerifyState = "idle" | "verifying" | "success" | "error";

export interface KeyFieldConfig {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Secrets render as a password field with a show/hide button. */
  masked?: boolean;
  placeholder?: string;
  /** What the show/hide button calls the value, e.g. "key" or "secret". */
  noun?: string;
  testId: string;
}

interface KeyVerifierProps {
  /** Form id; the footer's primary button submits it with `form={id}`. */
  id: string;
  fields: KeyFieldConfig[];
  verifyState: VerifyState;
  errorMessage?: string;
  idleText: string;
  checkingText: string;
  successText: string;
  /** Runs on Enter in any field and when the footer's primary button submits the form. */
  onSubmit: () => void;
  testId?: string;
}

/** The key form: labelled inputs and a live status line under them. */
export function KeyVerifier({
  id,
  fields,
  verifyState,
  errorMessage,
  idleText,
  checkingText,
  successText,
  onSubmit,
  testId = "key-verifier",
}: KeyVerifierProps) {
  const statusId = `${id}-status`;
  const heading = fields.length > 1 ? "Your keys" : "Your key";

  return (
    <form
      id={id}
      data-testid={testId}
      aria-label={heading}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-2xl border border-border bg-card px-[18px] pb-4 pt-[18px]"
    >
      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <KeyField
            key={field.testId}
            {...field}
            invalid={verifyState === "error"}
            describedBy={statusId}
            onEnter={onSubmit}
          />
        ))}
      </div>
      <VerifyStatus
        id={statusId}
        state={verifyState}
        errorMessage={errorMessage}
        idleText={idleText}
        checkingText={checkingText}
        successText={successText}
        testId={testId}
      />
    </form>
  );
}

function KeyField({
  label,
  value,
  onChange,
  masked = false,
  placeholder,
  noun = "key",
  testId,
  invalid,
  describedBy,
  onEnter,
}: KeyFieldConfig & { invalid: boolean; describedBy: string; onEnter: () => void }) {
  const inputId = React.useId();
  const [revealed, setRevealed] = React.useState(false);

  return (
    <div data-testid={testId} className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-[13px] font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          data-testid={`${testId}-input`}
          type={masked && !revealed ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Handled here rather than by implicit submission, which depends on
            // the footer button (outside this form) being the default button.
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            onEnter();
          }}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={cn(
            "h-10 w-full rounded-lg border bg-background/60 px-3 font-mono text-[13px] text-foreground outline-none",
            "placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring",
            invalid ? "border-destructive" : "border-input",
            masked && "pr-11",
          )}
        />
        {masked && (
          <button
            type="button"
            data-testid={`${testId}-toggle`}
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? `Hide ${noun}` : `Show ${noun}`}
            className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {revealed ? (
              <EyeOff className="size-4" strokeWidth={1.5} aria-hidden />
            ) : (
              <Eye className="size-4" strokeWidth={1.5} aria-hidden />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function VerifyStatus({
  id,
  state,
  errorMessage,
  idleText,
  checkingText,
  successText,
  testId,
}: {
  id: string;
  state: VerifyState;
  errorMessage?: string;
  idleText: string;
  checkingText: string;
  successText: string;
  testId: string;
}) {
  return (
    <div
      id={id}
      role="status"
      aria-live="polite"
      data-testid={`${testId}-status`}
      data-state={state}
      className="mt-3 flex min-h-5 items-start gap-2 text-[13px] leading-5"
    >
      {state === "idle" && <span className="text-muted-foreground">{idleText}</span>}
      {state === "verifying" && (
        <>
          <Loader2 className="mt-0.5 size-4 shrink-0 text-muted-foreground motion-safe:animate-spin" strokeWidth={1.5} aria-hidden />
          <span className="text-muted-foreground">{checkingText}</span>
        </>
      )}
      {state === "success" && (
        <>
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" strokeWidth={1.5} aria-hidden />
          <span className="text-green-700 dark:text-green-400">{successText}</span>
        </>
      )}
      {state === "error" && (
        <>
          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" strokeWidth={1.5} aria-hidden />
          <span data-testid={`${testId}-error`} className="text-destructive">
            {errorMessage || "That didn’t work. Check the value and try again."}
          </span>
        </>
      )}
    </div>
  );
}

/**
 * The footer's primary button for a key step. It submits the key form, so it
 * verifies until the key checks out and then continues.
 */
export function KeySubmitButton({
  form,
  testId,
  verifyState,
  verifyLabel,
  canContinue,
  disabled,
}: {
  form: string;
  testId: string;
  verifyState: VerifyState;
  verifyLabel: string;
  /** True when submitting would move on rather than verify. */
  canContinue: boolean;
  disabled: boolean;
}) {
  const busy = verifyState === "verifying";
  return (
    <Button type="submit" form={form} data-testid={testId} disabled={disabled || busy} className={FOOTER_PRIMARY}>
      {busy ? (
        <>
          <Loader2 className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
          Checking…
        </>
      ) : canContinue ? (
        <>
          Continue
          <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
        </>
      ) : (
        verifyLabel
      )}
    </Button>
  );
}

/** "How to get one": numbered steps with a time estimate. */
export function HowToCard({
  testId,
  duration,
  durationTestId,
  steps,
}: {
  testId: string;
  duration: string;
  durationTestId: string;
  steps: React.ReactNode[];
}) {
  const headingId = React.useId();
  return (
    <section aria-labelledby={headingId} data-testid={testId} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-[18px] py-3.5">
        <h2 id={headingId} className="text-[13px] font-semibold text-foreground">
          How to get one
        </h2>
        <span
          data-testid={durationTestId}
          className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {duration}
        </span>
      </div>
      <ol className="flex flex-col gap-3 border-t border-border/70 px-[18px] py-4">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-[13px] leading-5 text-muted-foreground">
            <span
              aria-hidden
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold tabular-nums text-foreground"
            >
              {i + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Inline link to an outside site; opens in the browser. */
export function ExternalLinkText({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 rounded-sm font-medium text-primary underline decoration-primary/40 underline-offset-2 outline-none hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
      <ExternalLink className="size-3" strokeWidth={1.5} aria-hidden />
      <span className="sr-only"> (opens in your browser)</span>
    </a>
  );
}

/** Emphasised label from the other site's interface. */
export function UiLabel({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-foreground">{children}</strong>;
}
