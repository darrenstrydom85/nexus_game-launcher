import * as React from "react";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useGameStore } from "@/stores/gameStore";
import type { DetectedGame as StoreDetectedGame } from "@/stores/onboardingStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { FolderPlus, X, Loader2, Check } from "lucide-react";

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

export function SourcesStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const setDetectedGames = useOnboardingStore((s) => s.setDetectedGames);
  const setGames = useGameStore((s) => s.setGames);
  const setSourceEnabled = useSettingsStore((s) => s.setSourceEnabled);

  const [launchers, setLaunchers] = React.useState<LauncherInfo[]>([]);
  const [folders, setFolders] = React.useState<WatchedFolder[]>([]);
  const [selectedSources, setSelectedSources] = React.useState<Set<string>>(new Set());
  const [scanning, setScanning] = React.useState(false);
  const [scanProgress, setScanProgress] = React.useState(0);
  const [scanStatus, setScanStatus] = React.useState("");
  const [scanComplete, setScanComplete] = React.useState(false);
  const [foundCount, setFoundCount] = React.useState(0);

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
    }).catch(() => {});

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
  }, []);

  const handleScan = React.useCallback(async () => {
    setScanning(true);
    setScanProgress(0);
    setScanStatus("Saving source preferences...");
    setScanComplete(false);
    setFoundCount(0);

    try {
      for (const id of ALL_SOURCE_IDS) {
        const enabled = selectedSources.has(id);
        setSourceEnabled(id, enabled);
      }

      setScanProgress(20);
      setScanStatus("Scanning sources...");
      const result = await invoke<ScanResult>("scan_sources");
      setScanProgress(80);

      // Persist raw scan results (with sourceId, sourceFolderId, etc.) so the
      // confirm step can pass them straight to confirm_games without data loss.
      setDetectedGames(result.games);

      const games = result.games.map((g, i) => ({
        id: `detected-${i}`,
        name: g.name,
        source: g.source as import("@/stores/gameStore").GameSource,
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
      }));

      setGames(games);
      setFoundCount(games.length);
      setScanProgress(100);
      setScanStatus(`Found ${games.length} games!`);
      setScanComplete(true);
    } catch {
      setScanStatus("Scan failed. Try again.");
    } finally {
      setScanning(false);
    }
  }, [setGames, setDetectedGames, selectedSources, setSourceEnabled]);

  return (
    <div data-testid="sources-step" className="flex w-full max-w-2xl flex-col gap-6">
      <h2 className="text-xl font-bold text-foreground">Add Game Sources</h2>

      {/* Detected Launchers */}
      <div data-testid="detected-launchers">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Detected Launchers</h3>
        <div className="flex flex-col gap-1">
          {launchers.map((launcher) => {
            const isDetected = launcher.detectionMethod !== "unavailable";
            return (
              <label
                key={launcher.sourceId}
                data-testid={`launcher-${launcher.sourceId}`}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 transition-colors",
                  "hover:bg-accent/50",
                )}
              >
                <input
                  type="checkbox"
                  data-testid={`launcher-check-${launcher.sourceId}`}
                  checked={selectedSources.has(launcher.sourceId)}
                  onChange={() => toggleSource(launcher.sourceId)}
                  className="size-4 rounded border-border"
                />
                <span className="flex-1 text-sm font-medium text-foreground">
                  {launcher.displayName}
                </span>
                <span className={cn("text-xs", isDetected ? "text-success" : "text-muted-foreground")}>
                  {isDetected ? launcher.resolvedPath ?? "Detected" : "Not found"}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Game Folders */}
      <div data-testid="game-folders">
        <h3 className="mb-2 text-sm font-semibold text-foreground">Game Folders</h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Point this to folders where each subfolder contains a game
        </p>
        <div className="flex flex-col gap-1">
          {folders.map((folder) => (
            <div
              key={folder.id}
              data-testid={`folder-${folder.path}`}
              className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-1.5"
            >
              <code className="flex-1 truncate text-xs text-muted-foreground">{folder.path}</code>
              <button
                data-testid={`folder-remove-${folder.id}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => handleRemoveFolder(folder.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <Button
          data-testid="add-folder"
          variant="secondary"
          size="sm"
          className="mt-2 gap-1"
          onClick={handleAddFolder}
        >
          <FolderPlus className="size-4" />
          Add Folder
        </Button>
      </div>

      {/* Scan */}
      <div data-testid="scan-area" className="flex flex-col gap-2">
        {scanning && (
          <div className="flex flex-col gap-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                data-testid="scan-progress-bar"
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <span data-testid="scan-status" className="text-xs text-muted-foreground">
              {scanStatus}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            data-testid="scan-now"
            disabled={scanning || (selectedSources.size === 0 && folders.length === 0)}
            onClick={handleScan}
            className="gap-1"
          >
            {scanning ? (
              <><Loader2 className="size-4 animate-spin" /> Scanning...</>
            ) : scanComplete ? (
              <><Check className="size-4" /> Scan Again ({foundCount} found)</>
            ) : (
              "Scan Now"
            )}
          </Button>

          {scanComplete && (
            <Button data-testid="sources-next" onClick={goNext}>
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
