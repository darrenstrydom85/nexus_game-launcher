import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen, FolderPlus, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSettingsStore, type WatchedFolder } from "@/stores/settingsStore";
import { refreshGames, useGameStore, type Game, type GameSource } from "@/stores/gameStore";
import { SOURCE_ICON_COMPONENTS, SOURCE_LABELS } from "@/lib/source-icons";
import { RowIcon, SettingsCard, SettingsRow, ToggleRow } from "../SettingsKit";

const SOURCE_IDS: GameSource[] = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox", "standalone"];

const VIEWS: { value: "grid" | "list"; label: string }[] = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];

const SORTS = [
  { value: "name", label: "Name" },
  { value: "lastPlayed", label: "Recently played" },
  { value: "totalPlayTime", label: "Most played" },
  { value: "addedAt", label: "Recently added" },
  { value: "rating", label: "Rating" },
];

const CONTINUE_MAX = [3, 5, 8].map((n) => ({ value: String(n), label: `${n} games` }));

const HLTB_PACE = [0.5, 1, 1.5, 2, 2.5, 3, 4, 6, 8].map((h) => ({
  value: String(h),
  label: h === 0.5 ? "30 minutes a day" : `${h} ${h === 1 ? "hour" : "hours"} a day`,
}));

const NOTE_TIMEOUTS = [
  { value: "30", label: "30 seconds" },
  { value: "60", label: "60 seconds" },
  { value: "90", label: "90 seconds" },
  { value: "0", label: "Never" },
];

interface ScanResult {
  games: ({ source: string } & Record<string, unknown>)[];
  errors: { source: string; message: string }[];
}

function gamesLabel(n: number) {
  return n === 0 ? "No games" : `${n.toLocaleString()} ${n === 1 ? "game" : "games"}`;
}

const normalisePath = (p: string) => p.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

/** Standalone games whose folder or exe sits inside `folder`. */
function countGamesIn(games: Game[], folder: string) {
  const root = normalisePath(folder);
  return games.filter(
    (g) =>
      g.source === "standalone" &&
      g.status !== "removed" &&
      [g.folderPath, g.exePath].some((p) => {
        if (!p) return false;
        const n = normalisePath(p);
        return n === root || n.startsWith(`${root}\\`);
      }),
  ).length;
}

/** A row whose control is a Select; options carry string values. */
function SelectRow({
  label,
  description,
  value,
  onValueChange,
  options,
  disabled,
  ...rest
}: {
  label: string;
  description?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  "data-testid"?: string;
}) {
  const id = React.useId();
  return (
    <SettingsRow label={label} description={description} descriptionId={description ? `${id}-desc` : undefined}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          aria-label={label}
          aria-describedby={description ? `${id}-desc` : undefined}
          data-testid={rest["data-testid"]}
          className="h-[34px] min-w-40"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );
}

function GameSourcesCard() {
  const sourcesEnabled = useSettingsStore((s) => s.sourcesEnabled);
  const setSourceEnabled = useSettingsStore((s) => s.setSourceEnabled);
  const games = useGameStore((s) => s.games);
  const [rescanning, setRescanning] = React.useState(false);

  const counts = React.useMemo(() => {
    const c: Partial<Record<GameSource, number>> = {};
    for (const g of games) if (g.status !== "removed") c[g.source] = (c[g.source] ?? 0) + 1;
    return c;
  }, [games]);

  const handleRescan = async () => {
    setRescanning(true);
    try {
      const result = await invoke<ScanResult>("scan_sources");
      // Sources missing from the map (standalone, until toggled) count as enabled, as the switches show.
      const enabled = useSettingsStore.getState().sourcesEnabled;
      const filtered = result.games.filter((g) => enabled[g.source] ?? true);
      if (filtered.length > 0) {
        await invoke("confirm_games", { detectedGames: filtered });
        await invoke("relink_play_sessions");
      }
      await refreshGames();
    } catch {
      // best-effort
    } finally {
      setRescanning(false);
    }
  };

  return (
    <SettingsCard title="Game sources" data-testid="library-sources">
      {SOURCE_IDS.map((id) => {
        const Icon = SOURCE_ICON_COMPONENTS[id];
        return (
          <ToggleRow
            key={id}
            data-testid={`source-toggle-${id}`}
            label={SOURCE_LABELS[id]}
            description={gamesLabel(counts[id] ?? 0)}
            checked={sourcesEnabled[id] ?? true}
            onCheckedChange={(v) => setSourceEnabled(id, v)}
            leading={
              <RowIcon>
                <Icon className="size-[18px]" />
              </RowIcon>
            }
          />
        );
      })}
      <SettingsRow label="Scan for new games" description="Checks every source that’s switched on, plus your watched folders">
        <Button variant="outline" size="sm" data-testid="rescan-all" disabled={rescanning} onClick={handleRescan}>
          {rescanning ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={1.75} aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" strokeWidth={1.75} aria-hidden />
          )}
          {rescanning ? "Scanning…" : "Scan now"}
        </Button>
      </SettingsRow>
    </SettingsCard>
  );
}

function WatchedFoldersCard() {
  const folders = useSettingsStore((s) => s.watchedFolders);
  const addFolder = useSettingsStore((s) => s.addWatchedFolder);
  const removeFolder = useSettingsStore((s) => s.removeWatchedFolder);
  const games = useGameStore((s) => s.games);
  // Kept after closing so the dialog text doesn't blank out while it fades.
  const [target, setTarget] = React.useState<WatchedFolder | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const handleAdd = async () => {
    try {
      const selected = await open({ directory: true, multiple: false, title: "Select a game folder" });
      if (!selected) return;
      const path = selected as string;
      if (folders.some((f) => f.path === path)) return;
      const folder = await invoke<WatchedFolder>("add_watched_folder", { path });
      addFolder(folder);
    } catch {
      // duplicate or DB error — silently ignore
    }
  };

  const handleRemove = async () => {
    if (!target) return;
    try {
      await invoke("remove_watched_folder", { id: target.id });
    } catch {
      // best-effort
    }
    removeFolder(target.id);
  };

  return (
    <>
      <SettingsCard title="Watched folders" data-testid="folder-manager">
        {folders.map((folder) => (
          <SettingsRow
            key={folder.id}
            data-testid={`folder-entry-${folder.id}`}
            label={<span className="break-all font-mono text-[13px]">{folder.path}</span>}
            description={gamesLabel(countGamesIn(games, folder.path))}
            leading={
              <RowIcon>
                <FolderOpen className="size-[18px]" strokeWidth={1.5} />
              </RowIcon>
            }
          >
            <Button
              variant="outline"
              size="sm"
              data-testid={`folder-remove-${folder.id}`}
              aria-label={`Remove ${folder.path}`}
              onClick={() => {
                setTarget(folder);
                setConfirmOpen(true);
              }}
            >
              Remove
            </Button>
          </SettingsRow>
        ))}
        <SettingsRow label={folders.length > 0 ? "Scan another folder for standalone games" : "Scan a folder for standalone games"}>
          <Button size="sm" data-testid="add-folder-btn" onClick={handleAdd}>
            <FolderPlus className="size-3.5" strokeWidth={2} aria-hidden />
            Add folder
          </Button>
        </SettingsRow>
      </SettingsCard>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Stop watching this folder?"
        description={
          <>
            Nexus won’t scan <span className="break-all font-mono text-[13px] text-foreground">{target?.path}</span> any more. Games
            already in your library stay.
          </>
        }
        confirmLabel="Remove"
        destructive
        onConfirm={handleRemove}
      />
    </>
  );
}

function PreferencesCard() {
  const s = useSettingsStore();

  return (
    <SettingsCard title="Preferences" data-testid="library-preferences">
      <SettingsRow label="Default view">
        <SegmentedControl aria-label="Default view" value={s.defaultView} onValueChange={s.setDefaultView} options={VIEWS} />
      </SettingsRow>
      <SelectRow data-testid="pref-default-sort" label="Default sort" value={s.defaultSort} onValueChange={s.setDefaultSort} options={SORTS} />
      <ToggleRow
        data-testid="pref-continue-playing-enabled"
        label="Show Continue Playing"
        description="Recent games on Home"
        checked={s.continuePlayingEnabled}
        onCheckedChange={s.setContinuePlayingEnabled}
      />
      <SelectRow
        data-testid="pref-continue-playing-max"
        label="Max games shown"
        value={String(s.continuePlayingMax)}
        onValueChange={(v) => s.setContinuePlayingMax(Number(v))}
        options={CONTINUE_MAX}
        disabled={!s.continuePlayingEnabled}
      />
      <ToggleRow
        data-testid="pref-show-card-progress"
        label="Show progress on game cards"
        checked={s.showCardProgress}
        onCheckedChange={s.setShowCardProgress}
      />
      <ToggleRow
        data-testid="pref-auto-status"
        label="Auto-status transitions"
        description="Update a game’s status automatically as you play"
        checked={s.autoStatusTransitions}
        onCheckedChange={s.setAutoStatusTransitions}
      />
      <ToggleRow
        data-testid="pref-retirement-ceremony-enabled"
        label="Retirement ceremony"
        description="Celebrate when you mark a game completed or dropped. You can replay it from the game’s page."
        checked={s.retirementCeremonyEnabled}
        onCheckedChange={s.setRetirementCeremonyEnabled}
      />
      <SelectRow
        data-testid="pref-hltb-hours-per-day"
        label="Daily play time"
        description="Used for How Long to Beat day estimates"
        value={String(s.hltbHoursPerDay)}
        onValueChange={(v) => s.setHltbHoursPerDay(Number(v))}
        options={HLTB_PACE}
      />
      <ToggleRow
        data-testid="pref-session-note-prompt-enabled"
        label="Post-session note prompt"
        description="Ask for a quick note when a session ends"
        checked={s.sessionNotePromptEnabled}
        onCheckedChange={s.setSessionNotePromptEnabled}
      />
      <SelectRow
        data-testid="pref-session-note-prompt-timeout"
        label="Auto-dismiss timeout"
        value={String(s.sessionNotePromptTimeout)}
        onValueChange={(v) => s.setSessionNotePromptTimeout(Number(v))}
        options={NOTE_TIMEOUTS}
        disabled={!s.sessionNotePromptEnabled}
      />
    </SettingsCard>
  );
}

export function LibrarySection() {
  return (
    <>
      <GameSourcesCard />
      <WatchedFoldersCard />
      <PreferencesCard />
    </>
  );
}
