import * as React from "react";
import { listen } from "@tauri-apps/api/event";
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settingsStore";
import { checkLibraryHealth, runHltbBackfill, type DeadGame, type HealthCheckProgressEvent, type HltbBackfillProgressEvent } from "@/lib/tauri";
import { HealthCheckModal } from "./HealthCheckModal";
import { useTauriEvent } from "@/hooks/use-tauri-event";

export function LibraryHealth() {
  const lastHealthCheckAt = useSettingsStore((s) => s.lastHealthCheckAt);
  const healthCheckIssueCount = useSettingsStore((s) => s.healthCheckIssueCount);
  const autoHealthCheck = useSettingsStore((s) => s.autoHealthCheck);
  const setAutoHealthCheck = useSettingsStore((s) => s.setAutoHealthCheck);
  const setHealthCheckResult = useSettingsStore((s) => s.setHealthCheckResult);

  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<{ checked: number; total: number } | null>(null);
  const [deadGames, setDeadGames] = React.useState<DeadGame[]>([]);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [hasRun, setHasRun] = React.useState(false);
  const [hltbBackfillRunning, setHltbBackfillRunning] = React.useState(false);
  const [hltbBackfillCount, setHltbBackfillCount] = React.useState<number | null>(null);
  const [hltbProgress, setHltbProgress] = React.useState<{ completed: number; total: number; currentGame: string } | null>(null);
  const [hltbSummary, setHltbSummary] = React.useState<{ found: number; notFound: number; errored: number } | null>(null);

  const handleRunCheck = React.useCallback(async () => {
    setRunning(true);
    setProgress(null);

    const unlisten = await listen<HealthCheckProgressEvent>("health-check-progress", (event) => {
      setProgress({ checked: event.payload.checked, total: event.payload.total });
    });

    try {
      const report = await checkLibraryHealth();
      setDeadGames(report.deadGames);
      setHealthCheckResult(report.checkedAt, report.deadGames.length);
      setHasRun(true);
    } catch {
      // best-effort
    } finally {
      unlisten();
      setRunning(false);
      setProgress(null);
    }
  }, [setHealthCheckResult]);

  const handleRunHltbBackfill = React.useCallback(async () => {
    setHltbBackfillRunning(true);
    setHltbBackfillCount(null);
    setHltbProgress(null);
    setHltbSummary(null);
    try {
      const count = await runHltbBackfill();
      setHltbBackfillCount(count);
      if (count === 0) {
        setHltbBackfillRunning(false);
      }
    } catch {
      setHltbBackfillRunning(false);
    }
  }, []);

  const handleHltbProgress = React.useCallback(
    (event: HltbBackfillProgressEvent) => {
      const { completed, total, currentGame, found, notFound, errored } = event;
      if (total === 0) return;
      setHltbProgress({ completed, total, currentGame });
      if (completed >= total) {
        setHltbBackfillRunning(false);
        setHltbProgress(null);
        setHltbSummary({ found, notFound, errored });
      }
    },
    [],
  );

  useTauriEvent("hltb-backfill-progress", handleHltbProgress);

  const lastCheckLabel = React.useMemo(() => {
    if (!lastHealthCheckAt) return "Never checked";
    try {
      return `Last checked ${new Date(lastHealthCheckAt).toLocaleDateString()}`;
    } catch {
      return "Last checked recently";
    }
  }, [lastHealthCheckAt]);

  return (
    <section data-testid="library-health-section">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldCheck className="size-4" />
        Library Health
      </h3>

      <div className="flex flex-col gap-3">
        {/* Status row */}
        <div className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{lastCheckLabel}</span>
            {(hasRun || lastHealthCheckAt) && (
              <span className="text-xs text-muted-foreground">
                {healthCheckIssueCount === 0
                  ? "No issues found"
                  : `${healthCheckIssueCount} issue${healthCheckIssueCount !== 1 ? "s" : ""} found`}
              </span>
            )}
          </div>

          {running && progress ? (
            <span className="text-xs text-muted-foreground">
              Checking {progress.checked} / {progress.total}…
            </span>
          ) : running ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        {/* Run button */}
        <Button
          data-testid="run-health-check"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={running}
          onClick={handleRunCheck}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          {running ? "Running…" : "Run Health Check"}
        </Button>

        {/* Result */}
        {hasRun && !running && (
          <>
            {healthCheckIssueCount === 0 ? (
              <div
                data-testid="health-check-all-healthy"
                className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2 text-xs text-success"
              >
                <CheckCircle2 className="size-4 shrink-0" />
                All games look healthy
              </div>
            ) : (
              <div
                data-testid="health-check-issues-found"
                className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2"
              >
                <AlertTriangle className="size-4 shrink-0 text-warning" />
                <span className="flex-1 text-xs text-foreground">
                  {healthCheckIssueCount} game{healthCheckIssueCount !== 1 ? "s" : ""} could not be found
                </span>
                <Button
                  data-testid="health-check-review"
                  variant="secondary"
                  size="xs"
                  onClick={() => setModalOpen(true)}
                >
                  Review
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Auto-check toggle */}
      <div className="flex items-center justify-between rounded-md bg-secondary/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">Check automatically on startup</span>
        <button
          data-testid="auto-health-check-toggle"
          role="switch"
          aria-checked={autoHealthCheck}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
            "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            autoHealthCheck ? "bg-primary" : "bg-secondary",
          )}
          onClick={() => setAutoHealthCheck(!autoHealthCheck)}
        >
          <span
            className={cn(
              "pointer-events-none inline-block size-4 rounded-full bg-white shadow-lg",
              "transform transition-transform duration-200",
              autoHealthCheck ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>
      </div>

      {/* HLTB backfill */}
      <div className="mt-3 flex flex-col gap-2">
        <Button
          data-testid="run-hltb-backfill"
          variant="secondary"
          size="sm"
          className="gap-1.5"
          disabled={hltbBackfillRunning}
          onClick={handleRunHltbBackfill}
        >
          {hltbBackfillRunning ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {hltbBackfillRunning ? "Fetching…" : "Re-fetch HLTB Data"}
        </Button>

        {hltbBackfillRunning && hltbProgress && (
          <div
            data-testid="hltb-backfill-progress"
            className="flex flex-col gap-1.5 rounded-md bg-secondary/30 px-3 py-2"
          >
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="truncate">{hltbProgress.currentGame || "Starting…"}</span>
              <span className="ml-2 shrink-0 tabular-nums">
                {hltbProgress.completed}/{hltbProgress.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${hltbProgress.total > 0 ? (hltbProgress.completed / hltbProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {hltbBackfillRunning && !hltbProgress && (
          <div className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            Checking which games need HLTB data…
          </div>
        )}

        {hltbBackfillCount !== null && !hltbBackfillRunning && (
          <div
            data-testid="hltb-backfill-result"
            className="flex flex-col gap-1.5 rounded-md bg-secondary/30 px-3 py-2 text-xs"
          >
            {hltbBackfillCount === 0 ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="size-3.5 shrink-0" />
                All games already have HLTB data
              </div>
            ) : hltbSummary ? (
              <>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  Processed {hltbBackfillCount} game{hltbBackfillCount !== 1 ? "s" : ""}
                </div>
                <div className="ml-6 flex flex-col gap-0.5 text-muted-foreground">
                  {hltbSummary.found > 0 && (
                    <span className="text-success">
                      {hltbSummary.found} matched on HLTB
                    </span>
                  )}
                  {hltbSummary.notFound > 0 && (
                    <span>
                      {hltbSummary.notFound} not found on HLTB
                    </span>
                  )}
                  {hltbSummary.errored > 0 && (
                    <span className="text-destructive">
                      {hltbSummary.errored} failed (network error)
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="size-3.5 shrink-0" />
                Fetched HLTB data for {hltbBackfillCount} game{hltbBackfillCount !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        )}
      </div>

      <HealthCheckModal
        open={modalOpen}
        deadGames={deadGames}
        onClose={() => setModalOpen(false)}
        onDeadGamesChange={setDeadGames}
      />
    </section>
  );
}
