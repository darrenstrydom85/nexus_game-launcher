import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore, type NavItem } from "@/stores/uiStore";
import { useGameStore } from "@/stores/gameStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { Titlebar } from "@/components/shared/Titlebar";
import { Sidebar } from "@/components/shared/Sidebar";
import { HardwareBranding } from "@/components/shared/HardwareBranding";
import type { AppShellProps } from "@/components/shared/AppShell";
import { useHeroGame, useGameAccent } from "@/components/experience/useGameAccent";
import { ChannelStatusBar } from "./ChannelStatusBar";
import { AnimatePresence, motion } from "motion/react";
import { Search, Settings, SlidersHorizontal, X } from "lucide-react";

const TABS: { id: NavItem; label: string }[] = [
  { id: "library", label: "Library" },
  { id: "stats", label: "Stats" },
  { id: "completed", label: "Completed" },
  { id: "archive", label: "Archive" },
  { id: "achievements", label: "Awards" },
  { id: "twitch", label: "Twitch" },
];

/**
 * Channel experience: console-dashboard shell. Top tabs replace the sidebar
 * nav; a bottom status bar carries the session, streak and level; the full
 * sidebar (collections, filters, queue) lives in a flyout panel.
 * Same nav ids, same handler props as AppShell — presentation only.
 */
export function ChannelShell({
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
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const flyoutOpen = useUiStore((s) => s.sidebarOpen);
  const setFlyoutOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarVisible = useUiStore((s) => s.setSidebarVisible);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const liveCount = useTwitchStore((s) => s.liveCount);
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);

  const games = useGameStore((s) => s.games);
  const heroGame = useHeroGame(games);
  const rootRef = React.useRef<HTMLDivElement>(null);
  useGameAccent(rootRef, heroGame);

  React.useEffect(() => {
    setSidebarVisible(false);
    setFlyoutOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = twitchEnabled ? TABS : TABS.filter((t) => t.id !== "twitch");

  return (
    <div
      ref={rootRef}
      className="experience-channel flex h-screen flex-col overflow-hidden bg-background"
      data-testid="channel-shell"
    >
      {/* Ambient wash from the selected game's art */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[420px]"
        style={{
          background:
            "radial-gradient(1000px 420px at 50% -10%, color-mix(in srgb, var(--game-accent, var(--primary)) 22%, transparent), transparent 65%)",
        }}
      />
      <Titlebar />

      {/* Tab row */}
      <nav
        data-testid="channel-tabs"
        className="relative z-10 flex h-12 shrink-0 items-center gap-1 px-10"
        role="navigation"
        aria-label="Main navigation"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`nav-${tab.id}`}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeNav === tab.id
                ? "bg-foreground font-semibold text-background"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
            onClick={() => setActiveNav(tab.id)}
            aria-current={activeNav === tab.id ? "page" : undefined}
          >
            {tab.label}
            {tab.id === "twitch" && liveCount > 0 && isAuthenticated && (
              <span className="ml-1.5 inline-block size-1.5 rounded-full bg-red-500 align-middle" aria-hidden />
            )}
          </button>
        ))}
        <div className="flex-1" />
        <button
          data-testid="channel-filters-toggle"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setFlyoutOpen(!flyoutOpen)}
          aria-label="Collections and filters"
          title="Collections & filters"
        >
          <SlidersHorizontal className="size-4" />
        </button>
        <button
          data-testid="channel-search"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
        >
          <Search className="size-4" />
        </button>
        <button
          data-testid="settings-button"
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onSettingsClick}
          aria-label="Settings"
        >
          <Settings className="size-4" />
        </button>
      </nav>

      {/* Flyout: full sidebar content */}
      <AnimatePresence>
        {flyoutOpen && (
          <>
            <motion.div
              data-testid="channel-flyout-backdrop"
              className="fixed inset-0 z-40 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setFlyoutOpen(false)}
            />
            <motion.aside
              data-testid="channel-flyout"
              className="glass-sidebar fixed bottom-0 right-0 top-0 z-50 flex w-[280px] flex-col"
              initial={{ x: 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 24, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              <div className="flex h-10 shrink-0 items-center justify-end px-3 pt-8">
                <button
                  data-testid="channel-flyout-close"
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

      {/* Main content */}
      <main
        data-testid="channel-content"
        className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden"
      >
        {children}
      </main>

      <ChannelStatusBar
        onStopGame={onStopGame}
        onGameDetails={onGameDetails}
        onForceIdentify={onForceIdentify}
        onNavigateToStats={() => setActiveNav("stats")}
      />
    </div>
  );
}
