import * as React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Award,
  BarChart3,
  Copy,
  Download,
  Flame,
  Home,
  Library,
  Loader2,
  Minus,
  RefreshCw,
  RotateCw,
  Search,
  Settings,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore, type NavItem, type SettingsCategory } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { useStreakStore } from "@/stores/streakStore";
import { useXpStore } from "@/stores/xpStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useAchievementStore } from "@/stores/achievementStore";
import { useSyncStore } from "@/stores/syncStore";
import { useUpdateStore } from "@/stores/updateStore";
import { navigateToStatsSection } from "@/lib/navigation";
import { TwitchIcon } from "@/lib/source-icons/TwitchIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import nexusLogo20 from "@/assets/nexus-logo-20.png";

interface TopBarProps {
  onResync: () => void;
  isSyncing: boolean;
  onOpenSettings: (category?: SettingsCategory) => void;
  onOpenUpdate: () => void;
}

interface Tab {
  id: NavItem;
  label: string;
  icon: React.ReactNode;
}

const ICON = "size-4 shrink-0";

function tabFor(nav: NavItem): NavItem {
  if (nav === "completed" || nav === "archive") return "library";
  if (nav === "wrapped") return "stats";
  return nav;
}

export function TopBar({ onResync, isSyncing, onOpenSettings, onOpenUpdate }: TopBarProps) {
  const appWindowRef = React.useRef(getCurrentWindow());
  const [isMaximized, setIsMaximized] = React.useState(false);

  const activeNav = useUiStore((s) => s.activeNav);
  const setActiveNav = useUiStore((s) => s.setActiveNav);
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const gameCount = useGameStore((s) => s.games.length);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const setRetroMode = useSettingsStore((s) => s.setRetroMode);
  const healthIssueCount = useSettingsStore((s) => s.healthCheckIssueCount);
  const liveCount = useTwitchStore((s) => s.liveCount);
  const twitchAuthed = useTwitchStore((s) => s.isAuthenticated);
  const newAchievements = useAchievementStore((s) => s.newUnlockCount);
  const streak = useStreakStore((s) => s.streak);
  const xp = useXpStore((s) => s.summary);
  const syncActive = useSyncStore((s) => s.isActive);

  React.useEffect(() => {
    const appWindow = appWindowRef.current;
    let cancelled = false;
    const refresh = () =>
      appWindow.isMaximized().then((max) => {
        if (!cancelled) setIsMaximized(max);
      });
    refresh();
    const unlisten = appWindow.onResized(refresh);
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  // Double-click on empty bar space maximises; never when the click came from a control.
  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".titlebar-no-drag")) return;
    appWindowRef.current.toggleMaximize();
  };

  const tabs: Tab[] = [
    { id: "home", label: "Home", icon: <Home className={ICON} strokeWidth={1.5} /> },
    { id: "library", label: "Library", icon: <Library className={ICON} strokeWidth={1.5} /> },
    { id: "stats", label: "Stats", icon: <BarChart3 className={ICON} strokeWidth={1.5} /> },
    { id: "achievements", label: "Achievements", icon: <Award className={ICON} strokeWidth={1.5} /> },
    ...(twitchEnabled
      ? [{ id: "twitch" as NavItem, label: "Twitch", icon: <TwitchIcon className={ICON} /> }]
      : []),
  ];
  const currentTab = tabFor(activeNav);
  const showLive = twitchAuthed && liveCount > 0;

  return (
    <header
      data-testid="top-bar"
      data-tauri-drag-region
      onDoubleClick={onDoubleClick}
      className="titlebar-drag-region flex h-14 shrink-0 select-none items-center gap-4 border-b border-border bg-sidebar pl-4"
    >
      <button
        type="button"
        onClick={() => setActiveNav("home")}
        aria-label="Nexus home"
        className="titlebar-no-drag pressable flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <img src={nexusLogo20} alt="" width={20} height={20} className="size-5" />
        <span className="text-[15px] font-semibold tracking-tight text-foreground max-[900px]:sr-only">
          Nexus
        </span>
      </button>

      <nav aria-label="Main" className="titlebar-no-drag flex items-center gap-0.5">
        {tabs.map((tab) => {
          const active = currentTab === tab.id;
          const badge =
            tab.id === "twitch" && showLive
              ? String(liveCount)
              : tab.id === "achievements" && newAchievements > 0
                ? String(newAchievements)
                : null;
          return (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-testid={`top-tab-${tab.id}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={
                    tab.id === "twitch" && showLive ? `Twitch, ${liveCount} live` : tab.label
                  }
                  onClick={() => setActiveNav(tab.id)}
                  className={cn(
                    "pressable flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium outline-none",
                    "focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <span className="min-[1100px]:hidden">{tab.icon}</span>
                  <span className="max-[1099px]:sr-only">{tab.label}</span>
                  {badge && (
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold tabular-nums",
                        tab.id === "twitch" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground",
                      )}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="min-[1100px]:hidden">
                {tab.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          data-testid="top-search"
          onClick={() => setSearchOpen(true)}
          aria-label="Search (Ctrl K)"
          className={cn(
            "@container titlebar-no-drag pressable flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-input bg-background/60 px-3 text-left text-sm text-muted-foreground outline-none",
            "max-w-[420px] hover:border-ring/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            "max-[900px]:size-9 max-[900px]:flex-none max-[900px]:justify-center max-[900px]:px-0",
          )}
        >
          <Search className={ICON} strokeWidth={1.5} />
          <span className="truncate max-[900px]:sr-only">
            {gameCount > 0 ? `Search ${gameCount} games, collections, tags` : "Search"}
          </span>
          {/* Never wraps; hides once the field is too narrow to hold it beside the text. */}
          <kbd className="ml-auto shrink-0 whitespace-nowrap rounded border border-border px-1.5 py-px font-mono text-[11px] text-muted-foreground max-[900px]:hidden @max-[260px]:hidden">
            Ctrl K
          </kbd>
        </button>
      </div>

      <div className="titlebar-no-drag flex items-center gap-1.5">
        <UpdatePill onOpenUpdate={onOpenUpdate} />

        {streak && streak.currentStreak > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="top-streak"
                onClick={() => setActiveNav("stats")}
                aria-label={`${streak.currentStreak} day play streak`}
                className="pressable flex h-8 items-center gap-1.5 rounded-full border border-orange-500/25 bg-orange-500/10 px-2.5 text-[13px] font-semibold tabular-nums text-orange-600 outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-orange-400"
              >
                <Flame className="size-[15px]" strokeWidth={2} />
                {streak.currentStreak}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {streak.currentStreak}-day streak · best {streak.longestStreak}
            </TooltipContent>
          </Tooltip>
        )}

        {xp && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid="top-level"
                onClick={() => navigateToStatsSection("xp")}
                aria-label={`Level ${xp.currentLevel}, ${xp.totalXp.toLocaleString()} XP`}
                className="pressable flex h-8 items-center gap-2 rounded-full border border-border bg-background/60 pl-1 pr-2.5 text-[13px] font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring max-[1000px]:pr-1"
              >
                <LevelRing level={xp.currentLevel} progress={xp.progressToNextLevel} />
                <span className="max-[1000px]:sr-only">Lv {xp.currentLevel}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {xp.currentLevelXp.toLocaleString()} / {xp.nextLevelXp.toLocaleString()} XP to level{" "}
              {xp.currentLevel + 1}
            </TooltipContent>
          </Tooltip>
        )}

        <IconButton
          label={isSyncing || syncActive ? "Syncing library" : "Sync library"}
          testId="top-sync"
          onClick={onResync}
          disabled={isSyncing}
        >
          {isSyncing || syncActive ? (
            <Loader2 className={cn(ICON, "motion-safe:animate-spin")} strokeWidth={1.5} />
          ) : (
            <RefreshCw className={ICON} strokeWidth={1.5} />
          )}
        </IconButton>
        <IconButton label="Switch to Retro Mode" testId="top-retro" onClick={() => setRetroMode(true)}>
          <Terminal className={ICON} strokeWidth={1.5} />
        </IconButton>
        <SettingsButton onOpenSettings={onOpenSettings} healthIssueCount={healthIssueCount} />

        <div className="ml-1.5 flex self-stretch">
          <WindowButton label="Minimize" testId="top-minimize" onClick={() => appWindowRef.current.minimize()}>
            <Minus className={ICON} strokeWidth={1.5} />
          </WindowButton>
          <WindowButton
            label={isMaximized ? "Restore" : "Maximize"}
            testId="top-maximize"
            onClick={() => appWindowRef.current.toggleMaximize()}
          >
            {isMaximized ? (
              <Copy className="size-3.5" strokeWidth={1.5} />
            ) : (
              <Square className="size-3.5" strokeWidth={1.5} />
            )}
          </WindowButton>
          <WindowButton
            label="Close"
            testId="top-close"
            onClick={() => appWindowRef.current.close()}
            className="hover:bg-destructive hover:text-white"
          >
            <X className={ICON} strokeWidth={1.5} />
          </WindowButton>
        </div>
      </div>
    </header>
  );
}

function IconButton({
  label,
  testId,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  disabled?: boolean;
  /** The page this button opens is showing. */
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-label={label}
          aria-current={active ? "page" : undefined}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "pressable relative flex size-9 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
            active && "bg-accent text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function SettingsButton({
  onOpenSettings,
  healthIssueCount,
}: {
  onOpenSettings: (category?: SettingsCategory) => void;
  healthIssueCount: number;
}) {
  const updateAvailable = useUpdateStore((s) => s.updateAvailable);
  const onSettingsPage = useUiStore((s) => s.activeNav === "settings");
  const label =
    healthIssueCount > 0
      ? `Settings, ${healthIssueCount} library health issue${healthIssueCount === 1 ? "" : "s"}`
      : updateAvailable
        ? "Settings, update available"
        : "Settings";
  return (
    <IconButton
      label={label}
      testId="top-settings"
      active={onSettingsPage}
      // The dot says why; the click goes there.
      onClick={() => onOpenSettings(healthIssueCount > 0 ? "data" : updateAvailable ? "about" : undefined)}
    >
      <Settings className={ICON} strokeWidth={1.5} />
      {(healthIssueCount > 0 || updateAvailable) && (
        <span
          data-testid="top-settings-dot"
          aria-hidden
          className={cn(
            "absolute right-1.5 top-1.5 size-2 rounded-full ring-2 ring-sidebar",
            healthIssueCount > 0 ? "bg-warning" : "bg-primary",
          )}
        />
      )}
    </IconButton>
  );
}

function WindowButton({
  label,
  testId,
  onClick,
  className,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex w-[46px] items-center justify-center text-muted-foreground outline-none transition-[color,background-color] duration-150",
        "hover:bg-accent hover:text-foreground focus-visible:bg-accent",
        className,
      )}
    >
      {children}
    </button>
  );
}

const RING = 22;
const STROKE = 2.5;
const RADIUS = (RING - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

function LevelRing({ level, progress }: { level: number; progress: number }) {
  return (
    <span className="relative flex size-[22px] items-center justify-center" aria-hidden>
      <svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`} className="absolute inset-0 -rotate-90">
        <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke="var(--secondary)" strokeWidth={STROKE} />
        <circle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - Math.min(Math.max(progress, 0), 1))}
        />
      </svg>
      <span className="text-[10px] font-bold tabular-nums">{level}</span>
    </span>
  );
}

/** Keeps a pending update visible even after its popup was dismissed. */
function UpdatePill({ onOpenUpdate }: { onOpenUpdate: () => void }) {
  const phase = useUpdateStore((s) => s.phase);
  const popupDismissed = useUpdateStore((s) => s.popupDismissed);
  const downloaded = useUpdateStore((s) => s.downloadedBytes);
  const total = useUpdateStore((s) => s.totalBytes);
  const restart = useUpdateStore((s) => s.restart);

  const base =
    "pressable flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (phase === "ready") {
    return (
      <button type="button" data-testid="top-update" onClick={() => restart()} className={cn(base, "bg-primary text-primary-foreground")}>
        <RotateCw className="size-3.5" strokeWidth={2} />
        Restart to update
      </button>
    );
  }
  if (phase === "downloading") {
    const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    return (
      <button
        type="button"
        data-testid="top-update"
        onClick={onOpenUpdate}
        className={cn(base, "border border-primary/40 bg-primary/10 tabular-nums text-foreground")}
      >
        <Download className="size-3.5" strokeWidth={2} />
        Updating {pct}%
      </button>
    );
  }
  if (phase === "available" && popupDismissed) {
    return (
      <button
        type="button"
        data-testid="top-update"
        onClick={onOpenUpdate}
        className={cn(base, "border border-primary/40 bg-primary/10 text-foreground hover:bg-primary/20")}
      >
        <Download className="size-3.5" strokeWidth={2} />
        Update available
      </button>
    );
  }
  return null;
}
