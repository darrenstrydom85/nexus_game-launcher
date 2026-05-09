import * as React from "react";
import { cn, formatRunningTimer } from "@/lib/utils";
import { Square, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ManualTrackingToastProps {
  gameName: string;
  startedAt: string;
  onStop: () => void;
}

export function ManualTrackingToast({
  gameName,
  startedAt,
  onStop,
}: ManualTrackingToastProps) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    const startTime = new Date(startedAt).getTime();
    const update = () => setElapsed(Date.now() - startTime);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <div
      data-testid="manual-tracking-toast"
      className={cn(
        "glass-toast flex w-80 flex-col gap-2 rounded-lg p-3 shadow-lg",
      )}
    >
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-warning" />
        <span className="text-sm text-foreground">
          Couldn't detect <strong>{gameName}</strong> running.
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Click "Stop" when you're done playing.
      </p>
      <div className="flex items-center justify-between">
        <span
          data-testid="manual-tracking-timer"
          className="font-mono text-sm tabular-nums text-foreground"
        >
          {formatRunningTimer(elapsed)}
        </span>
        <Button
          data-testid="manual-tracking-stop"
          variant="destructive"
          size="sm"
          className="gap-1"
          onClick={onStop}
        >
          <Square className="size-3" />
          Stop
        </Button>
      </div>
    </div>
  );
}
