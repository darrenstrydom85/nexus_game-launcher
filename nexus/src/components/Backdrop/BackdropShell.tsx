import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore, type NavItem } from "@/stores/uiStore";
import { useGameStore } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { Titlebar } from "@/components/shared/Titlebar";
import { Sidebar } from "@/components/shared/Sidebar";
import { NowPlaying } from "@/components/shared/NowPlaying";
import { HardwareBranding } from "@/components/shared/HardwareBranding";
import { LevelBadge } from "@/components/Xp/LevelBadge";
import { StreakWidget } from "@/components/Streak/StreakWidget";
import type { AppShellProps } from "@/components/shared/AppShell";
import { useHeroGame, useGameAccent } from "@/components/experience/useGameAccent";
import { AnimatePresence, motion } from "motion/react";
import {
  Archive,
  Award,
  BarChart3,
  Library,
  Shuffle,
  SlidersHorizontal,
  Settings,
  Trophy,
  X,
} from "lucide-react";
import { TwitchIcon } from "@/lib/source-icons/TwitchIcon";

/**
 * Backdrop experience: cinematic, art-first shell. A 64px icon rail replaces
 * the sidebar; the full sidebar (collections, filters, queue) lives in a
 * flyout panel; Now Playing floats as a capsule over the content.
 * Same nav ids, same handler props as AppShell — presentation only.
 */
export function BackdropShell({
  children,
  onSettingsClick,
  onAddCollection,
  onEditCollection,
  onDeleteCollection,
  onStopGame,
  onGameDetails,
  onForceIdentify,
  onPlayGame,
}: AppShellProps) {
  const activeNav = useUiStore((s) => s.activeNav);
  const setActiveNav = useUiStore((s) => s.setActiveNav);
  const toggleSourceFilter = useUiStore((s) => s.toggleSourceFilter);
  const flyoutOpen = useUiStore((s) => s.sidebarOpen);
  const setFlyoutOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarVisible = useUiStore((s) => s.setSidebarVisible);
  const healthIssueCount = useSettingsStore((s) => s.healthCheckIssueCount);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const liveCount = useTwitchStore((s) => s.liveCount);
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);

  const games = useGameStore((s) => s.games);
  const heroGame = useHeroGame(games);
  const rootRef = React.useRef<HTMLDivElement>(null);
  useGameAccent(rootRef, heroGame);

  // The floating NowPlaying capsule replaces the sidebar-docked card, so tell
  // consumers the sidebar surface is not visible (same as AppShell minimal).
  React.useEffect(() => {
    setSidebarVisible(false);
    setFlyoutOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: "library", label: "Library", icon: <Library className="size-[18px]" /> },
    { id: "stats", label: "Stats", icon: <BarChart3 className="size-[18px]" /> },
    { id: "random", label: "Random", icon: <Shuffle className="size-[18px]" /> },
    { id: "completed", label: "Completed", icon: <Trophy className="size-[18px]" /> },
    { id: "archive", label: "Archive", icon: <Archive className="size-[18px]" /> },
    { id: "achievements", label: "Achievements", icon: <Award className="size-[18px]" /> },
    ...(twitchEnabled
      ? [{
          id: "twitch" as NavItem,
          label: "Twitch",
          icon: (
            <span className="relative inline-flex shrink-0">
              <TwitchIcon className="size-[18px]" />
              {liveCount > 0 && isAuthenticated && (
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-500" aria-hidden />
              )}
            </span>
          ),
        }]
      : []),
  ];

  return (
    <div
      ref={rootRef}
      className="experience-backdrop flex h-screen flex-col overflow-hidden bg-background"
      data-testid="backdrop-shell"
    >
      <Titlebar />

      <div className="flex flex-1 overflow-hidden">
        {/* Icon rail */}
        <aside
          data-testid="backdrop-rail"
          className="z-10 flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar/80 py-2"
        >
          <button
            data-testid="backdrop-flyout-toggle"
            className={cn(
              "flex size-10 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              flyoutOpen && "bg-accent text-foreground",
            )}
            onClick={() => setFlyoutOpen(!flyoutOpen)}
            aria-label={flyoutOpen ? "Close panel" : "Open collections and filters"}
            title="Collections & filters"
          >
            <SlidersHorizontal className="size-[18px]" />
          </button>

          <div className="mx-2 my-1 w-8 border-t border-border" />

          {navItems.map((item) => (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              className={cn(
                "relative flex size-10 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeNav === item.id && "text-foreground",
              )}
              onClick={() => setActiveNav(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-current={activeNav === item.id ? "page" : undefined}
            >
              {activeNav === item.id && (
                <span
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full"
                  style={{ background: "var(--game-accent, var(--primary))" }}
                />
              )}
              {item.icon}
            </button>
          ))}

          <div className="flex-1" />

          <LevelBadge sidebarOpen={false} onClick={() => setActiveNav("stats")} />
          <StreakWidget sidebarOpen={false} onNavigateToStats={() => setActiveNav("stats")} />

          <button
            data-testid="settings-button"
            className={cn(
              "flex size-10 items-center justify-center rounded-md text-muted-foreground",
              "transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={onSettingsClick}
            title="Settings"
            aria-label="Settings"
          >
            <span className="relative">
              <Settings className="size-[18px]" />
              {healthIssueCount > 0 && (
                <span
                  data-testid="settings-health-badge"
                  className="absolute -right-1 -top-1 size-2 rounded-full bg-warning"
                  aria-label={`${healthIssueCount} library health issues`}
                />
              )}
            </span>
          </button>
        </aside>

        {/* Flyout: full sidebar content (collections, filters, queue, streak) */}
        <AnimatePresence>
          {flyoutOpen && (
            <>
              <motion.div
                data-testid="backdrop-flyout-backdrop"
                className="fixed inset-0 z-40 bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setFlyoutOpen(false)}
              />
              <motion.aside
                data-testid="backdrop-flyout"
                className="glass-sidebar fixed bottom-0 left-16 top-0 z-50 flex w-[280px] flex-col"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <div className="flex h-10 shrink-0 items-center justify-end px-3 pt-8">
                  <button
                    data-testid="backdrop-flyout-close"
                    className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    onClick={() => setFlyoutOpen(false)}
                    aria-label="Close panel"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
                  <Sidebar
                    activeNav={activeNav}
                    onNavigate={(item) => {
                      setActiveNav(item);
                      setFlyoutOpen(false);
                    }}
                    onToggleSource={toggleSourceFilter}
                    onAddCollection={onAddCollection}
                    onEditCollection={onEditCollection}
                    onDeleteCollection={onDeleteCollection}
                    onPlayGame={onPlayGame}
                  />
                </div>
                <HardwareBranding sidebarOpen={true} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content, full bleed */}
        <main
          data-testid="backdrop-content"
          className="relative flex-1 overflow-y-auto overflow-x-hidden"
        >
          {children}
        </main>
      </div>

      {/* Floating Now Playing capsule */}
      <div
        data-testid="backdrop-now-playing"
        className="pointer-events-none fixed bottom-3 left-[76px] z-50 w-[340px] [&>*]:pointer-events-auto"
      >
        <NowPlaying onStop={onStopGame} onDetails={onGameDetails} onForceIdentify={onForceIdentify} />
      </div>
    </div>
  );
}
