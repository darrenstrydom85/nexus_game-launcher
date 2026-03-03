import { cn } from "@/lib/utils";

export function SkeletonCard() {
  return (
    <div
      data-testid="skeleton-card"
      className={cn(
        "overflow-hidden rounded-lg bg-card",
        "animate-pulse",
      )}
      style={{ aspectRatio: "2 / 3" }}
    >
      <div className="h-full w-full bg-secondary/50" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-3">
        <div className="h-4 w-3/4 rounded bg-secondary" />
        <div className="h-3 w-1/2 rounded bg-secondary/60" />
      </div>
    </div>
  );
}
