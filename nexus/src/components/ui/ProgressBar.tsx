import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  color?: string;
  height?: number;
  className?: string;
  "data-testid"?: string;
}

const STATUS_BAR_COLORS: Record<string, string> = {
  playing: "bg-success",
  completed: "bg-primary",
  backlog: "bg-warning",
  dropped: "bg-destructive",
  wishlist: "bg-info",
};

export function ProgressBar({
  value,
  color,
  height = 8,
  className,
  "data-testid": testId,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const barClass = color && STATUS_BAR_COLORS[color] ? STATUS_BAR_COLORS[color] : "bg-primary";

  return (
    <div
      data-testid={testId}
      className={cn("w-full overflow-hidden rounded-full bg-secondary", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-300 ease-out", barClass)}
        style={{
          width: `${clamped}%`,
          ...(color && !STATUS_BAR_COLORS[color] ? { backgroundColor: color } : {}),
        }}
      />
    </div>
  );
}
