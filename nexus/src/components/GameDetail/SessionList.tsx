import * as React from "react";
import type { SessionRecord } from "@/types/analytics";
import { formatPlayTime } from "@/lib/utils";
import { InlineNoteEdit } from "@/components/Sessions/InlineNoteEdit";

const PAGE_SIZE = 20;

interface SessionListProps {
  sessions: SessionRecord[];
  onNoteUpdated?: (sessionId: string, note: string | null) => void;
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

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatSessionDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function SessionList({ sessions, onNoteUpdated }: SessionListProps) {
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
                className="rounded-md px-2 py-1.5 text-xs hover:bg-muted/50"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-foreground"
                    title={new Date(s.startedAt).toLocaleString()}
                  >
                    {formatSessionDate(s.startedAt)}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-foreground">
                      {formatPlayTime(s.durationS)}
                    </span>
                    <TrackingBadge method={s.trackingMethod} />
                  </div>
                </div>
                <div className="mt-1">
                  <InlineNoteEdit
                    sessionId={s.id}
                    note={s.note}
                    onNoteUpdated={onNoteUpdated}
                  />
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
