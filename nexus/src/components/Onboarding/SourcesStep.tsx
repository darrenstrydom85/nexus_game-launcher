import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { ArrowRight, Check, FolderOpen, FolderPlus, Gamepad2, Loader2, RotateCcw, Search } from "lucide-react";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useGameStore, type GameSource } from "@/stores/gameStore";
import type { DetectedGame as StoreDetectedGame } from "@/stores/onboardingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { SOURCE_ICON_COMPONENTS } from "@/lib/source-icons";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { FOOTER_BUTTON, FOOTER_PRIMARY, FooterNote, StepFooter } from "./StepFooter";

interface LauncherInfo {
  sourceId: string;
  displayName: string;
  resolvedPath: string | null;
  detectionMethod: "override" | "auto" | "default" | "unavailable";
}

interface ScanResult {
  games: DetectedGame[];
  errors: { source: string; message: string }[];
}

type DetectedGame = StoreDetectedGame;

interface WatchedFolder {
  id: string;
  path: string;
}

const ALL_SOURCE_IDS = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox"] as const;

const CARD = "overflow-hidden rounded-2xl border border-border bg-card";
const CARD_HEAD = "flex items-center justify-between gap-3 px-[18px] py-3.5";
const ROWS = "divide-y divide-border/70 border-t border-border/70";
const TILE = "flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-secondary";

function gamesFound(n: number) {
  return `${n.toLocaleString()} ${n === 1 ? "game" : "games"} found`;
}

export function SourcesStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const setDetectedGames = useOnboardingStore((s) => s.setDetectedGames);
  const setGames = useGameStore((s) => s.setGames);
  const setSourceEnabled = useSettingsStore((s) => s.setSourceEnabled);

  /** null while detection is still running. */
  const [launchers, setLaunchers] = React.useState<LauncherInfo[] | null>(null);
  const [folders, setFolders] = React.useState<WatchedFolder[]>([]);
  const [selectedSources, setSelectedSources] = React.useState<Set<string>>(new Set());
  const [scanning, setScanning] = React.useState(false);
  const [scanProgress, setScanProgress] = React.useState(0);
  const [scanStatus, setScanStatus] = React.useState("");
  const [scanFailed, setScanFailed] = React.useState(false);
  const [scanComplete, setScanComplete] = React.useState(false);
  const [sourceCounts, setSourceCounts] = React.useState<Record<string, number>>({});
  const [folderCounts, setFolderCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    let cancelled = false;
    invoke<LauncherInfo[]>("detect_launchers").then((result) => {
      if (cancelled) return;
      setLaunchers(result);
      const detected = new Set(
        result
          .filter((l) => l.detectionMethod !== "unavailable")
          .map((l) => l.sourceId),
      );
      setSelectedSources(detected);
    }).catch(() => {
      if (!cancelled) setLaunchers([]);
    });

    invoke<WatchedFolder[]>("get_watched_folders").then((result) => {
      if (!cancelled) setFolders(result);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  const toggleSource = React.useCallback((sourceId: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
    // The last scan no longer matches what's selected.
    setScanComplete(false);
  }, []);

  const handleAddFolder = React.useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a game folder",
    });
    if (selected) {
      const path = selected as string;
      if (folders.some((f) => f.path === path)) return;
      try {
        const folder = await invoke<WatchedFolder>("add_watched_folder", { path });
        setFolders((prev) => [...prev, folder]);
        setScanComplete(false);
      } catch {
        // duplicate or DB error
      }
    }
  }, [folders]);

  const handleRemoveFolder = React.useCallback(async (id: string) => {
    try {
      await invoke("remove_watched_folder", { id });
    } catch {
      // best-effort
    }
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setScanComplete(false);
  }, []);

  const handleScan = React.useCallback(async () => {
    setScanning(true);
    setScanProgress(0);
    setScanStatus("Saving your choices…");
    setScanFailed(false);
    setScanComplete(false);

    try {
      for (const id of ALL_SOURCE_IDS) {
        const enabled = selectedSources.has(id);
        setSourceEnabled(id, enabled);
      }

      setScanProgress(20);
      setScanStatus("Looking for games…");
      const result = await invoke<ScanResult>("scan_sources");
      setScanProgress(80);

      // Persist raw scan results (with sourceId, sourceFolderId, etc.) so the
      // confirm step can pass them straight to confirm_games without data loss.
      setDetectedGames(result.games);

      const games = result.games.map((g, i) => ({
        id: `detected-${i}`,
        name: g.name,
        source: g.source as GameSource,
        folderPath: g.folderPath,
        exePath: g.exePath,
        exeName: g.exeName,
        launchUrl: g.launchUrl,
        igdbId: null,
        steamgridId: null,
        description: null,
        coverUrl: null,
        heroUrl: null,
        logoUrl: null,
        iconUrl: null,
        customCover: null,
        customHero: null,
        potentialExeNames: null,
        genres: [] as string[],
        releaseDate: null,
        criticScore: null,
        criticScoreCount: null,
        communityScore: null,
        communityScoreCount: null,
        trailerUrl: null,
        status: "backlog" as const,
        rating: null,
        totalPlayTimeS: 0,
        lastPlayedAt: null,
        playCount: 0,
        addedAt: new Date().toISOString(),
        isHidden: false,
        hltbMainH: null,
        hltbMainExtraH: null,
        hltbCompletionistH: null,
        hltbId: null,
        hltbFetchedAt: null,
        notes: null,
        progress: null,
        milestonesJson: null,
        completed: false,
      }));

      // Per-launcher and per-folder tallies for the rows.
      const bySource: Record<string, number> = {};
      const byFolder: Record<string, number> = {};
      for (const g of result.games) {
        bySource[g.source] = (bySource[g.source] ?? 0) + 1;
        if (g.sourceFolderId) byFolder[g.sourceFolderId] = (byFolder[g.sourceFolderId] ?? 0) + 1;
      }
      setSourceCounts(bySource);
      setFolderCounts(byFolder);

      setGames(games);
      setScanProgress(100);
      setScanStatus(`Found ${games.length.toLocaleString()} ${games.length === 1 ? "game" : "games"}`);
      setScanComplete(true);
    } catch {
      setScanFailed(true);
      setScanStatus("The scan didn’t finish. Try again.");
    } finally {
      setScanning(false);
    }
  }, [setGames, setDetectedGames, selectedSources, setSourceEnabled]);

  const detecting = launchers === null;
  const nothingSelected = selectedSources.size === 0 && folders.length === 0;
  const installedCount = launchers?.filter((l) => l.detectionMethod !== "unavailable").length ?? 0;

  return (
    <div data-testid="sources-step" className="flex flex-col gap-4">
      {/* Launchers */}
      <section aria-labelledby="sources-launchers-heading" aria-busy={detecting} data-testid="detected-launchers" className={CARD}>
        <div className={CARD_HEAD}>
          <h2 id="sources-launchers-heading" className="text-[13px] font-semibold text-foreground">
            Launchers
          </h2>
          {launchers === null ? (
            <span role="status" className="text-[12.5px] text-muted-foreground">
              Looking for launchers…
            </span>
          ) : (
            launchers.length > 0 && (
              <span className="text-[12.5px] tabular-nums text-muted-foreground">
                {installedCount} of {launchers.length} installed
              </span>
            )
          )}
        </div>
        <ul className={ROWS}>
          {launchers === null ? (
            ALL_SOURCE_IDS.map((id) => <SkeletonRow key={id} />)
          ) : launchers.length === 0 ? (
            <li className="px-[18px] py-4 text-[13px] text-muted-foreground">
              No launchers found. You can still add folders below.
            </li>
          ) : (
            launchers.map((launcher) => {
              const installed = launcher.detectionMethod !== "unavailable";
              const selected = selectedSources.has(launcher.sourceId);
              const status = !installed
                ? "Not installed"
                : scanComplete
                  ? selected
                    ? gamesFound(sourceCounts[launcher.sourceId] ?? 0)
                    : "Not included"
                  : launcher.resolvedPath
                    ? `Installed · ${launcher.resolvedPath}`
                    : "Installed";
              return (
                <LauncherRow
                  key={launcher.sourceId}
                  launcher={launcher}
                  installed={installed}
                  selected={selected}
                  status={status}
                  onToggle={toggleSource}
                />
              );
            })
          )}
        </ul>
      </section>

      {/* Watched folders */}
      <section aria-labelledby="sources-folders-heading" data-testid="game-folders" className={CARD}>
        <div className="px-[18px] py-3.5">
          <h2 id="sources-folders-heading" className="text-[13px] font-semibold text-foreground">
            Game folders
          </h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            For games outside a launcher. Each subfolder counts as one game.
          </p>
        </div>
        <ul className={ROWS}>
          {folders.length === 0 ? (
            <li className="px-[18px] py-4 text-[13px] text-muted-foreground">No folders added.</li>
          ) : (
            folders.map((folder) => (
              <li key={folder.id} data-testid={`folder-${folder.path}`} className="flex items-center gap-3 px-[18px] py-3">
                <span className={cn(TILE, "text-muted-foreground")}>
                  <FolderOpen className="size-[18px]" strokeWidth={1.5} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground" title={folder.path}>
                    {folder.path}
                  </p>
                  {scanComplete && (
                    <p className="mt-0.5 text-[12.5px] text-muted-foreground">{gamesFound(folderCounts[folder.id] ?? 0)}</p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`folder-remove-${folder.id}`}
                  onClick={() => handleRemoveFolder(folder.id)}
                  className="focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Remove<span className="sr-only"> {folder.path}</span>
                </Button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border/70 px-[18px] py-3">
          <Button
            data-testid="add-folder"
            variant="outline"
            size="sm"
            onClick={handleAddFolder}
            className="focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FolderPlus className="size-4" strokeWidth={1.5} aria-hidden />
            Add folder
          </Button>
        </div>
      </section>

      <StepFooter>
        <div data-testid="scan-area" role="status" aria-live="polite" className="flex min-w-0 items-center gap-2.5">
          {scanning ? (
            <>
              <span
                role="progressbar"
                aria-label="Scan progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={scanProgress}
                className="block h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-secondary"
              >
                <span
                  data-testid="scan-progress-bar"
                  className="block h-full origin-left rounded-full bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
                  style={{ transform: `scaleX(${scanProgress / 100})` }}
                />
              </span>
              <FooterNote data-testid="scan-status">{scanStatus}</FooterNote>
            </>
          ) : scanComplete ? (
            <span data-testid="scan-status" className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
              <Check className="size-4 text-green-700 dark:text-green-400" strokeWidth={2} aria-hidden />
              {scanStatus}
            </span>
          ) : scanFailed ? (
            <p data-testid="scan-status" className="text-[13px] text-destructive">
              {scanStatus}
            </p>
          ) : (
            nothingSelected &&
            !detecting && <FooterNote id="scan-hint">Turn on a launcher or add a folder first.</FooterNote>
          )}
        </div>

        {scanComplete ? (
          <>
            <Button data-testid="scan-now" variant="ghost" className={FOOTER_BUTTON} onClick={handleScan}>
              <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
              Scan again
            </Button>
            <Button data-testid="sources-next" className={FOOTER_PRIMARY} onClick={goNext}>
              Continue
              <ArrowRight className="size-4" strokeWidth={2} aria-hidden />
            </Button>
          </>
        ) : (
          <Button
            data-testid="scan-now"
            className={FOOTER_PRIMARY}
            disabled={scanning || detecting || nothingSelected}
            aria-describedby={nothingSelected && !detecting ? "scan-hint" : undefined}
            onClick={handleScan}
          >
            {scanning ? (
              <Loader2 className="size-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Search className="size-4" strokeWidth={2} aria-hidden />
            )}
            {scanning ? "Scanning…" : "Scan for games"}
          </Button>
        )}
      </StepFooter>
    </div>
  );
}

function LauncherRow({
  launcher,
  installed,
  selected,
  status,
  onToggle,
}: {
  launcher: LauncherInfo;
  installed: boolean;
  selected: boolean;
  status: string;
  onToggle: (sourceId: string) => void;
}) {
  const id = React.useId();
  const Icon = SOURCE_ICON_COMPONENTS[launcher.sourceId as GameSource] ?? Gamepad2;
  return (
    <li data-testid={`launcher-${launcher.sourceId}`} className="flex items-center gap-3 px-[18px] py-3">
      <span className={cn(TILE, installed ? "text-foreground" : "text-muted-foreground/70")}>
        <Icon className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {launcher.displayName}
        </label>
        <p id={`${id}-status`} className="mt-0.5 truncate text-[12.5px] text-muted-foreground">
          {status}
        </p>
      </div>
      <Switch
        id={id}
        data-testid={`launcher-check-${launcher.sourceId}`}
        checked={selected}
        onCheckedChange={() => onToggle(launcher.sourceId)}
        aria-describedby={`${id}-status`}
      />
    </li>
  );
}

/** Same footprint as a launcher row, so the swap doesn't shift anything. */
function SkeletonRow() {
  return (
    <li aria-hidden data-testid="launcher-skeleton" className="flex items-center gap-3 px-[18px] py-3">
      <span className="size-9 shrink-0 rounded-[9px] bg-secondary" />
      <span className="flex min-w-0 flex-1 flex-col gap-2 py-0.5">
        <span className="block h-3.5 w-28 rounded bg-secondary" />
        <span className="block h-3 w-44 max-w-full rounded bg-secondary/70" />
      </span>
      <span className="h-6 w-[42px] shrink-0 rounded-full bg-secondary" />
    </li>
  );
}
