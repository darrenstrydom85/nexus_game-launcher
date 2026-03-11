import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "motion/react";
import { Pencil, X, Target } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { ProgressSlider } from "./ProgressSlider";
import { MilestoneList } from "./MilestoneList";
import type { Game, Milestone } from "@/stores/gameStore";
import { refreshGames } from "@/stores/gameStore";

interface GameProgressProps {
  game: Game;
  onStatusChange?: (status: import("@/stores/gameStore").GameStatus) => void;
}

function parseMilestones(json: string | null): Milestone[] {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function calcProgressFromMilestones(milestones: Milestone[]): number | null {
  if (milestones.length < 2) return null;
  const completed = milestones.filter((m) => m.completed).length;
  return Math.round((completed / milestones.length) * 100);
}

export function GameProgress({ game, onStatusChange }: GameProgressProps) {
  const [editing, setEditing] = React.useState(false);
  const [progress, setProgress] = React.useState(game.progress ?? 0);
  const [milestones, setMilestones] = React.useState<Milestone[]>(() =>
    parseMilestones(game.milestonesJson),
  );
  const [showCompletionPrompt, setShowCompletionPrompt] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setProgress(game.progress ?? 0);
    setMilestones(parseMilestones(game.milestonesJson));
  }, [game.progress, game.milestonesJson]);

  const hasProgress = game.progress != null;

  const hltbRemaining = React.useMemo(() => {
    if (!game.hltbMainH || !hasProgress) return null;
    const playedH = game.totalPlayTimeS / 3600;
    const remaining = game.hltbMainH - playedH;
    return remaining > 0 ? remaining : null;
  }, [game.hltbMainH, game.totalPlayTimeS, hasProgress]);

  const save = React.useCallback(
    async (newProgress: number, newMilestones?: Milestone[]) => {
      setSaving(true);
      try {
        const ms = newMilestones ?? milestones;
        await invoke("update_game", {
          id: game.id,
          fields: {
            progress: newProgress,
            milestonesJson: ms.length > 0 ? JSON.stringify(ms) : null,
          },
        });
        await refreshGames();
      } catch {
        // best-effort
      } finally {
        setSaving(false);
      }
    },
    [game.id, milestones],
  );

  const handleProgressCommit = React.useCallback(
    (value: number) => {
      setProgress(value);
      if (value === 100 && game.status !== "completed") {
        setShowCompletionPrompt(true);
      } else {
        save(value);
      }
    },
    [game.status, save],
  );

  const handleMilestonesChange = React.useCallback(
    (updated: Milestone[]) => {
      setMilestones(updated);
      const autoProgress = calcProgressFromMilestones(updated);
      if (autoProgress != null) {
        setProgress(autoProgress);
        if (autoProgress === 100 && game.status !== "completed") {
          setShowCompletionPrompt(true);
        } else {
          save(autoProgress, updated);
        }
      } else {
        save(progress, updated);
      }
    },
    [game.status, progress, save],
  );

  const handleMarkCompleted = React.useCallback(() => {
    setShowCompletionPrompt(false);
    onStatusChange?.("completed");
    save(100);
  }, [onStatusChange, save]);

  const handleDismissCompletion = React.useCallback(() => {
    setShowCompletionPrompt(false);
    save(100);
  }, [save]);

  const handleStartTracking = React.useCallback(() => {
    setProgress(0);
    setEditing(true);
    save(0);
  }, [save]);

  const handleClearProgress = React.useCallback(async () => {
    setSaving(true);
    try {
      await invoke("update_game", {
        id: game.id,
        fields: {
          progress: null,
          milestonesJson: null,
        },
      });
      setEditing(false);
      setMilestones([]);
      setProgress(0);
      await refreshGames();
    } catch {
      // best-effort
    } finally {
      setSaving(false);
    }
  }, [game.id]);

  if (!hasProgress && !editing) {
    return (
      <div data-testid="game-progress" className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Progress</h3>
          <button
            data-testid="start-tracking-btn"
            onClick={handleStartTracking}
            className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            <Target className="size-3" />
            Track Progress
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Track how far you are through this game.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="game-progress" className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Progress</h3>
        <div className="flex items-center gap-1">
          {!editing ? (
            <button
              data-testid="edit-progress-btn"
              onClick={() => setEditing(true)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Edit progress"
            >
              <Pencil className="size-3.5" />
            </button>
          ) : (
            <button
              data-testid="close-progress-editor"
              onClick={() => setEditing(false)}
              className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label="Close editor"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {!editing && (
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar
            value={progress}
            color={game.status}
            data-testid="progress-bar"
            className="flex-1"
          />
          <span
            data-testid="progress-percentage"
            className="min-w-[3ch] text-right text-sm font-medium tabular-nums text-foreground"
          >
            {progress}%
          </span>
        </div>
      )}

      {hasProgress && game.hltbMainH != null && game.hltbMainH > 0 && (
        <div data-testid="hltb-vs-playtime" className="mt-2 flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Played</span>
            <span data-testid="progress-played" className="font-medium tabular-nums text-foreground">
              {formatPlayTime(game.totalPlayTimeS)}
              <span className="text-muted-foreground"> / {game.hltbMainH.toFixed(1)}h main story</span>
            </span>
          </div>
          {hltbRemaining != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Estimated remaining</span>
              <span data-testid="hltb-remaining" className="font-medium tabular-nums text-foreground">
                ~{hltbRemaining.toFixed(1)}h
              </span>
            </div>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="mt-4 flex flex-col gap-4">
              <ProgressSlider
                value={progress}
                color={game.status}
                onChange={setProgress}
                onCommit={handleProgressCommit}
              />

              <div>
                <h4 className="mb-2 text-xs font-medium text-muted-foreground">Milestones</h4>
                <MilestoneList
                  milestones={milestones}
                  onChange={handleMilestonesChange}
                />
              </div>

              <button
                data-testid="clear-progress-btn"
                onClick={handleClearProgress}
                disabled={saving}
                className={cn(
                  "self-start rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  "text-muted-foreground hover:text-destructive",
                  "disabled:pointer-events-none disabled:opacity-50",
                )}
              >
                Clear progress
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCompletionPrompt && (
          <motion.div
            data-testid="completion-prompt"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="mt-4 rounded-lg border border-primary/30 bg-primary/10 p-3"
          >
            <p className="mb-2 text-sm font-medium text-foreground">
              Mark as Completed?
            </p>
            <p className="mb-3 text-xs text-muted-foreground">
              You've reached 100% progress. Would you like to update the game status to Completed?
            </p>
            <div className="flex gap-2">
              <button
                data-testid="mark-completed-btn"
                onClick={handleMarkCompleted}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Yes, mark completed
              </button>
              <button
                data-testid="dismiss-completion-btn"
                onClick={handleDismissCompletion}
                className="rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
              >
                No, keep current status
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
