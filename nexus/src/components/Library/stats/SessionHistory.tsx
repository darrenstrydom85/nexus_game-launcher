import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { useGameStore } from "@/stores/gameStore";
import type { SessionRecord } from "../LibraryStats";

const PAGE_SIZE = 20;

interface SessionHistoryProps {
  sessions: SessionRecord[];
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionHistory({ sessions }: SessionHistoryProps) {
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);
  const storeGames = useGameStore((s) => s.games);
  const gameIdSet = React.useMemo(() => new Set(storeGames.map((g) => g.id)), [storeGames]);
  const [page, setPage] = React.useState(0);
  const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const pageItems = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div data-testid="session-history">
      <h3 className="mb-4 text-sm font-semibold text-foreground">
        Session History
      </h3>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No sessions recorded.</p>
      ) : (
        <>
          <div className="flex flex-col">
            {pageItems.map((s) => {
              const gameExists = gameIdSet.has(s.gameId);
              return (
              <div
                key={s.id}
                data-testid={`session-${s.id}`}
                className="grid items-center border-b border-border px-2 py-2 text-sm transition-colors hover:bg-white/5"
                style={{ gridTemplateColumns: "1fr 7rem 9rem 4rem" }}
              >
                {gameExists ? (
                  <button
                    className="truncate text-left font-medium text-foreground hover:text-primary hover:underline"
                    onClick={() => setDetailOverlayGameId(s.gameId)}
                  >
                    {s.gameName}
                  </button>
                ) : (
                  <span className="truncate text-left font-medium text-muted-foreground">
                    {s.gameName}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDate(s.startedAt)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatTime(s.startedAt)} – {formatTime(s.endedAt)}
                </span>
                <span className="text-right text-xs tabular-nums text-muted-foreground">
                  {formatDuration(s.durationS)}
                </span>
              </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div
            data-testid="session-pagination"
            className="mt-3 flex items-center justify-center gap-2"
          >
            <button
              data-testid="session-prev"
              className={cn(
                "rounded-md px-3 py-1 text-xs",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                page === 0 && "pointer-events-none opacity-50",
              )}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <button
              data-testid="session-next"
              className={cn(
                "rounded-md px-3 py-1 text-xs",
                "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                page >= totalPages - 1 && "pointer-events-none opacity-50",
              )}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
