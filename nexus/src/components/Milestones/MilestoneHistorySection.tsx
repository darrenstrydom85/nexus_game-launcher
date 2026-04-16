import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useMilestoneStore } from "@/stores/milestoneStore";
import { MilestoneIcon } from "./MilestoneIcon";
import { Award, X } from "lucide-react";
import type { SessionMilestone } from "@/lib/tauri";

interface MilestoneHistorySectionProps {
  sessionIds: string[];
}

interface GameCount {
  name: string;
  count: number;
}

interface AggregatedMilestone {
  milestone: SessionMilestone;
  count: number;
  games: GameCount[];
}

function aggregateMilestones(
  history: { sessionId: string; milestones: SessionMilestone[] }[] | null,
): AggregatedMilestone[] {
  if (!history) return [];
  const seen = new Map<string, { milestone: SessionMilestone; total: number; perGame: Map<string, number> }>();
  for (const entry of history) {
    for (const m of entry.milestones) {
      const existing = seen.get(m.id);
      if (existing) {
        existing.total++;
        if (m.gameName) {
          existing.perGame.set(m.gameName, (existing.perGame.get(m.gameName) ?? 0) + 1);
        }
      } else {
        const perGame = new Map<string, number>();
        if (m.gameName) perGame.set(m.gameName, 1);
        seen.set(m.id, { milestone: m, total: 1, perGame });
      }
    }
  }
  return Array.from(seen.values()).map(({ milestone, total, perGame }) => ({
    milestone,
    count: total,
    games: Array.from(perGame.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  }));
}

const MAX_INLINE_GAMES = 2;

function inlineGameLabel(games: GameCount[]): string {
  if (games.length === 0) return "";
  if (games.length <= MAX_INLINE_GAMES) return games.map((g) => g.name).join(", ");
  return `${games.slice(0, MAX_INLINE_GAMES).map((g) => g.name).join(", ")} +${games.length - MAX_INLINE_GAMES} more`;
}

export function MilestoneHistorySection({
  sessionIds,
}: MilestoneHistorySectionProps) {
  const history = useMilestoneStore((s) => s.history);
  const historyLoading = useMilestoneStore((s) => s.historyLoading);
  const loadHistory = useMilestoneStore((s) => s.loadHistory);
  const [selected, setSelected] = React.useState<AggregatedMilestone | null>(
    null,
  );

  React.useEffect(() => {
    if (sessionIds.length > 0) {
      loadHistory(sessionIds);
    }
  }, [sessionIds, loadHistory]);

  const uniqueMilestones = React.useMemo(
    () => aggregateMilestones(history),
    [history],
  );

  if (historyLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Award className="size-4 animate-pulse" />
          <span>Loading milestone history…</span>
        </div>
      </div>
    );
  }

  if (uniqueMilestones.length === 0) {
    return null;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-1">
          <Award className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Session Milestones
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {uniqueMilestones.map((entry) => (
            <button
              key={entry.milestone.id}
              type="button"
              data-testid={`milestone-card-${entry.milestone.id}`}
              className={cn(
                "flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left",
                "transition-colors hover:border-primary/30 hover:bg-card/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
              onClick={() => setSelected(entry)}
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <MilestoneIcon
                  name={entry.milestone.icon}
                  className="size-5"
                />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {entry.count}
                  <span className="text-sm font-medium text-muted-foreground">
                    ×
                  </span>
                </p>
                <p className="truncate text-xs font-medium text-foreground">
                  {entry.milestone.title}
                </p>
                {entry.games.length > 0 && (
                  <p className="truncate text-xs text-muted-foreground">
                    {inlineGameLabel(entry.games)}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <MilestoneDetailDialog
        entry={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

interface MilestoneDetailDialogProps {
  entry: AggregatedMilestone | null;
  onClose: () => void;
}

function MilestoneDetailDialog({ entry, onClose }: MilestoneDetailDialogProps) {
  React.useEffect(() => {
    if (!entry) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [entry, onClose]);

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          data-testid="milestone-detail-backdrop"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={`${entry.milestone.title} milestone details`}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            data-testid="milestone-detail-modal"
            className={cn(
              "relative z-10 flex w-full max-w-md flex-col rounded-xl",
              "bg-[hsla(240,10%,7%,0.85)] backdrop-blur-[24px]",
              "border border-border shadow-2xl",
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <MilestoneIcon
                    name={entry.milestone.icon}
                    className="size-5"
                  />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    {entry.milestone.title}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Earned {entry.count} {entry.count === 1 ? "time" : "times"}
                  </p>
                </div>
              </div>
              <button
                className={cn(
                  "rounded-md p-1 text-muted-foreground hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                onClick={onClose}
                aria-label="Close milestone details"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-4">
              <p className="text-sm text-muted-foreground">
                {entry.milestone.description}
              </p>

              {entry.games.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Games ({entry.games.length})
                  </h3>
                  <div className="space-y-1">
                    {entry.games.map((g) => (
                      <div
                        key={g.name}
                        className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-1.5"
                      >
                        <span className="text-sm text-foreground">
                          {g.name}
                        </span>
                        <span className="tabular-nums text-xs font-medium text-muted-foreground">
                          {g.count}×
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
