import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToastStore } from "@/stores/toastStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore, refreshGames } from "@/stores/gameStore";
import { DeadGameRow } from "./DeadGameRow";
import type { DeadGame } from "@/lib/tauri";

interface HealthCheckModalProps {
  open: boolean;
  deadGames: DeadGame[];
  onClose: () => void;
  onDeadGamesChange: (games: DeadGame[]) => void;
}

export function HealthCheckModal({
  open,
  deadGames,
  onClose,
  onDeadGamesChange,
}: HealthCheckModalProps) {
  const addToast = useToastStore((s) => s.addToast);
  const setHealthCheckResult = useSettingsStore((s) => s.setHealthCheckResult);
  const lastHealthCheckAt = useSettingsStore((s) => s.lastHealthCheckAt);
  const games = useGameStore((s) => s.games);
  const [confirmRemoveAll, setConfirmRemoveAll] = React.useState(false);
  const [removingAll, setRemovingAll] = React.useState(false);

  // Map game id → cover url from the game store
  const coverMap = React.useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const g of games) {
      map[g.id] = g.customCover ?? g.coverUrl ?? null;
    }
    return map;
  }, [games]);

  const handleRemove = React.useCallback(
    async (id: string) => {
      const game = deadGames.find((g) => g.id === id);
      if (!game) return;

      try {
        await invoke("update_game", { id, fields: { isHidden: true } });
        void refreshGames();
      } catch {
        // best-effort
      }

      const next = deadGames.filter((g) => g.id !== id);
      onDeadGamesChange(next);
      setHealthCheckResult(lastHealthCheckAt ?? new Date().toISOString(), next.length);

      const toastId = addToast({
        type: "info",
        message: `"${game.name}" removed from library.`,
        duration: 5000,
        action: {
          label: "Undo",
          onClick: async () => {
            try {
              await invoke("update_game", { id, fields: { isHidden: false } });
              void refreshGames();
              onDeadGamesChange([...next, game]);
              setHealthCheckResult(lastHealthCheckAt ?? new Date().toISOString(), next.length + 1);
            } catch {
              // best-effort
            }
          },
        },
      });
      void toastId;
    },
    [deadGames, onDeadGamesChange, addToast, setHealthCheckResult, lastHealthCheckAt],
  );

  const handlePathFixed = React.useCallback(
    (id: string, _newPath: string) => {
      const next = deadGames.filter((g) => g.id !== id);
      onDeadGamesChange(next);
      setHealthCheckResult(lastHealthCheckAt ?? new Date().toISOString(), next.length);
      addToast({ type: "success", message: "Executable path updated.", duration: 3000 });
    },
    [deadGames, onDeadGamesChange, setHealthCheckResult, lastHealthCheckAt, addToast],
  );

  const handleRemoveAll = React.useCallback(async () => {
    setRemovingAll(true);
    try {
      await Promise.all(
        deadGames.map((g) =>
          invoke("update_game", { id: g.id, fields: { isHidden: true } }).catch(() => {}),
        ),
      );
      void refreshGames();
      onDeadGamesChange([]);
      setHealthCheckResult(lastHealthCheckAt ?? new Date().toISOString(), 0);
      addToast({
        type: "info",
        message: `${deadGames.length} games removed from library.`,
        duration: 5000,
      });
      setConfirmRemoveAll(false);
    } finally {
      setRemovingAll(false);
    }
  }, [deadGames, onDeadGamesChange, setHealthCheckResult, lastHealthCheckAt, addToast]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const allClear = deadGames.length === 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="health-check-modal-backdrop"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            data-testid="health-check-modal"
            className={cn(
              "relative z-10 flex max-h-[80vh] w-full max-w-[720px] flex-col rounded-xl",
              "bg-[hsla(240,10%,7%,0.85)] backdrop-blur-[24px]",
              "border border-border shadow-2xl",
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                {allClear ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <AlertTriangle className="size-5 text-warning" />
                )}
                <h2 className="text-base font-semibold text-foreground">
                  {allClear ? "Library Health" : `${deadGames.length} Missing Game${deadGames.length !== 1 ? "s" : ""}`}
                </h2>
              </div>
              <button
                data-testid="health-check-modal-close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {allClear ? (
                <div
                  data-testid="health-check-all-clear"
                  className="flex flex-col items-center gap-3 py-10 text-center"
                >
                  <CheckCircle2 className="size-12 text-success" />
                  <p className="text-sm text-muted-foreground">All clear! Every game in your library looks healthy.</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  <div className="flex flex-col gap-2">
                    {deadGames.map((game) => (
                      <DeadGameRow
                        key={game.id}
                        game={game}
                        coverUrl={coverMap[game.id]}
                        onRemove={handleRemove}
                        onPathFixed={handlePathFixed}
                      />
                    ))}
                  </div>
                </AnimatePresence>
              )}
            </div>

            {/* Footer — Remove All */}
            {!allClear && (
              <div className="border-t border-border px-5 py-3">
                {!confirmRemoveAll ? (
                  <Button
                    data-testid="health-check-remove-all"
                    variant="destructive"
                    size="sm"
                    onClick={() => setConfirmRemoveAll(true)}
                  >
                    Remove All ({deadGames.length})
                  </Button>
                ) : (
                  <div
                    data-testid="health-check-remove-all-confirm"
                    className="flex items-center gap-3 rounded-md border border-destructive bg-destructive/10 px-3 py-2"
                  >
                    <span className="flex-1 text-xs text-foreground">
                      Remove all {deadGames.length} games from library? This cannot be undone in bulk.
                    </span>
                    <Button
                      size="xs"
                      variant="destructive"
                      disabled={removingAll}
                      onClick={handleRemoveAll}
                    >
                      {removingAll ? "Removing…" : "Yes, remove all"}
                    </Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={removingAll}
                      onClick={() => setConfirmRemoveAll(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
