import { WifiOff } from "lucide-react";

interface TwitchEmptyStateProps {
  variant: "empty" | "error";
  onRetry?: () => void;
}

export function TwitchEmptyState({ variant, onRetry }: TwitchEmptyStateProps) {
  if (variant === "empty") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm text-foreground">
          You&apos;re not following anyone on Twitch yet
        </p>
        <a
          href="https://twitch.tv/directory"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
        >
          Find streamers on Twitch →
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff
        className="size-8 text-muted-foreground"
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          Couldn&apos;t reach Twitch
        </p>
        <p className="text-xs text-muted-foreground">
          Check your internet connection and try again.
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Retry"
        >
          Retry
        </button>
      )}
    </div>
  );
}
