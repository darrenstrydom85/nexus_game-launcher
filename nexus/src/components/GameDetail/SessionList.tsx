import * as React from "react";
import type { SessionRecord } from "@/types/analytics";
import { formatPlayTime } from "@/lib/utils";

const PAGE_SIZE = 20;

interface SessionListProps {
  sessions: SessionRecord[];
}

function TrackingBadge({ method }: { method: string }) {
  const isAuto = method !== "manual";
  return (
    <span
      data-testid="tracking-badge"
      className={
        isAuto
          ? "rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400"
          : "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400"
      }
    >
      {isAuto ? "Auto" : "Manual"}
    </span>
  );
}

function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  }
  if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months}mo ago`;
  }
  const years = Math.floor(diffDays / 365);
  return `${years}y ago`;
}

export function SessionList({ sessions }: SessionListProps) {
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const visibleSessions = sessions.slice(0, visibleCount);
  const hasMore = visibleCount < sessions.length;

  return (
    <div data-testid="session-list">
      <p className="mb-3 text-xs font-medium text-muted-foreground">
        <span data-testid="session-count" className="tabular-nums text-foreground">
          {sessions.length}
        </span>{" "}
        {sessions.length === 1 ? "session" : "sessions"}
      </p>

      {sessions.length === 0 ? (
        <p data-testid="session-list-empty" className="py-6 text-center text-sm text-muted-foreground">
          No sessions recorded yet
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            {visibleSessions.map((s) => (
              <div
                key={s.id}
                data-testid="session-row"
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
              >
                <span
                  className="text-foreground"
                  title={new Date(s.startedAt).toLocaleString()}
                >
                  {formatRelativeDate(s.startedAt)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums text-foreground">
                    {formatPlayTime(s.durationS)}
                  </span>
                  <TrackingBadge method={s.trackingMethod} />
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              data-testid="load-more-btn"
              className="mt-2 w-full rounded-md bg-secondary py-1.5 text-center text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
            >
              Load more
            </button>
          )}
        </>
      )}
    </div>
  );
}
