import { cn } from "@/lib/utils";

export type ScoreBadgeSize = "sm" | "md";

interface ScoreBadgeProps {
  score: number;
  size?: ScoreBadgeSize;
  count?: number;
  label?: string;
  className?: string;
}

function scoreColorClass(score: number): string {
  if (score >= 75) return "bg-success/20 text-success border-success/40";
  if (score >= 50) return "bg-warning/20 text-warning border-warning/40";
  return "bg-destructive/20 text-destructive border-destructive/40";
}

function scoreColorTextBorder(score: number): string {
  if (score >= 75) return "text-success border-success";
  if (score >= 50) return "text-warning border-warning";
  return "text-destructive border-destructive";
}

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function ScoreBadge({
  score,
  size = "md",
  count,
  label,
  className,
}: ScoreBadgeProps) {
  const rounded = Math.round(score);
  const colorClass = scoreColorClass(score);

  const ariaLabel = [
    label ? `${label}:` : null,
    `${rounded} out of 100`,
    count != null ? `from ${count} ${count === 1 ? "review" : "reviews"}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (size === "sm") {
    return (
      <span
        data-testid="score-badge-sm"
        className={cn(
          "inline-flex items-center justify-center rounded-full border-2 font-semibold tabular-nums",
          "h-7 w-7 text-xs",
          "bg-black/70 backdrop-blur-sm",
          scoreColorTextBorder(score),
          className,
        )}
        aria-label={ariaLabel}
      >
        {rounded}
      </span>
    );
  }

  return (
    <div
      data-testid="score-badge-md"
      className={cn("flex flex-col items-center gap-0.5", className)}
      aria-label={ariaLabel}
    >
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full border font-semibold tabular-nums",
          "h-12 w-12 text-base",
          colorClass,
        )}
      >
        {rounded}
      </span>
      {count != null && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {formatCount(count)} {count === 1 ? "review" : "reviews"}
        </span>
      )}
    </div>
  );
}
