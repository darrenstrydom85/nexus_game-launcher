import * as React from "react";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VerifyState = "idle" | "verifying" | "success" | "error";

interface KeyVerifierProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  masked?: boolean;
  placeholder?: string;
  verifyState: VerifyState;
  errorMessage?: string;
  onVerify: () => void;
  showVerifyButton?: boolean;
  testId?: string;
}

export function KeyVerifier({
  label,
  value,
  onChange,
  masked = true,
  placeholder,
  verifyState,
  errorMessage,
  onVerify,
  showVerifyButton = true,
  testId = "key-verifier",
}: KeyVerifierProps) {
  const [showValue, setShowValue] = React.useState(!masked);

  return (
    <div data-testid={testId} className="flex flex-col gap-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            data-testid={`${testId}-input`}
            type={showValue ? "text" : "password"}
            className={cn(
              "w-full rounded-md border border-border bg-input px-3 py-2 font-mono text-sm text-foreground",
              "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
              verifyState === "error" && "border-destructive",
              verifyState === "success" && "border-success",
            )}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {masked && (
            <button
              data-testid={`${testId}-toggle`}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setShowValue(!showValue)}
              type="button"
              aria-label={showValue ? "Hide" : "Show"}
            >
              {showValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          )}
        </div>
        {showVerifyButton && (
          <Button
            data-testid={`${testId}-verify`}
            variant="secondary"
            disabled={!value.trim() || verifyState === "verifying"}
            onClick={onVerify}
            className="gap-1.5"
          >
            {verifyState === "verifying" && <Loader2 className="size-4 animate-spin" />}
            {verifyState === "success" && <CheckCircle className="size-4 text-success" />}
            {verifyState === "error" && <XCircle className="size-4 text-destructive" />}
            {verifyState === "idle" ? "Verify" : verifyState === "verifying" ? "Verifying..." : verifyState === "success" ? "Verified" : "Retry"}
          </Button>
        )}
      </div>
      {verifyState === "error" && errorMessage && (
        <p data-testid={`${testId}-error`} className="text-xs text-destructive">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
