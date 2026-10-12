import * as React from "react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore, type SettingsCategory } from "@/stores/uiStore";
import { TopBar } from "./shell/TopBar";
import { NowPlayingStrip } from "./shell/NowPlayingStrip";
import { SyncStrip } from "./shell/SyncStrip";
import { LibraryPage, type LibraryPageProps } from "./library/LibraryPage";
import { QuickViewDrawer } from "./library/QuickViewDrawer";
import { GamePage } from "./game/GamePage";
import { HomePage } from "./home/HomePage";
import { StatsPage } from "./stats/StatsPage";
import { AchievementsPage } from "./achievements/AchievementsPage";
import { TwitchPage } from "./twitch/TwitchPage";
import { SettingsPage } from "./settings/SettingsPage";

interface ModernAppProps {
  /** Page for nav items not rebuilt yet. Phases replace these one by one. */
  page: React.ReactNode;
  /** Dialogs, toasts and prompts shared with the classic shell. */
  overlays: React.ReactNode;
  library: LibraryPageProps;
  onStopGame: () => void;
  onForceIdentify: () => void;
  onResync: () => void;
  isSyncing: boolean;
  onOpenSettings: (category?: SettingsCategory) => void;
  onOpenUpdate: () => void;
  onOpenRandom: () => void;
}

// The shell remounts when leaving retro or switching layouts; only the first mount picks Home.
let landedThisLaunch = false;

/** v1.0 shell: top bar + now-playing strip, then the page with the quick view pushing in beside it. */
export function ModernApp({
  page,
  overlays,
  library,
  onStopGame,
  onForceIdentify,
  onResync,
  isSyncing,
  onOpenSettings,
  onOpenUpdate,
  onOpenRandom,
}: ModernAppProps) {
  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const reduceMotion = useSettingsStore((s) => s.reducedMotion);
  const activeNav = useUiStore((s) => s.activeNav);
  const openGameId = useUiStore((s) => s.detailOverlayGameId);

  React.useEffect(() => {
    if (landedThisLaunch) return;
    landedThisLaunch = true;
    useUiStore.getState().setActiveNav("home");
  }, []);

  const isLibrary = activeNav === "library" || activeNav === "completed" || activeNav === "archive";

  return (
    <MotionConfig reducedMotion={enableAnimations && !reduceMotion ? "user" : "always"}>
      <TooltipProvider delayDuration={300}>
        <div data-testid="modern-app" className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <div className="shrink-0">
            <TopBar
              onResync={onResync}
              isSyncing={isSyncing}
              onOpenSettings={onOpenSettings}
              onOpenUpdate={onOpenUpdate}
            />
            <NowPlayingStrip
              onStop={onStopGame}
              onForceIdentify={onForceIdentify}
              onQuickView={(id) => useUiStore.getState().setQuickViewGameId(id)}
            />
            <SyncStrip />
          </div>
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {/* Inert while a game page covers it, so Tab can't wander underneath. */}
            <main
              data-testid="modern-main"
              // React 19 supports `inert`; the installed types predate it.
              {...({ inert: openGameId !== null } as React.HTMLAttributes<HTMLElement>)}
              className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
            >
              {activeNav === "home" ? (
                <HomePage
                  onPlay={library.onPlay}
                  onStop={onStopGame}
                  onOpenRandom={onOpenRandom}
                  onResync={onResync}
                  onOpenSettings={onOpenSettings}
                  menu={library}
                />
              ) : isLibrary ? (
                <LibraryPage {...library} />
              ) : activeNav === "stats" ? (
                <StatsPage onOpenWrapped={() => useUiStore.getState().setActiveNav("wrapped")} />
              ) : activeNav === "achievements" ? (
                <AchievementsPage />
              ) : activeNav === "twitch" ? (
                <TwitchPage />
              ) : activeNav === "settings" ? (
                <SettingsPage />
              ) : (
                page
              )}
            </main>
            <QuickViewDrawer
              onPlay={library.onPlay}
              onEdit={library.onEdit}
              onSearchMetadata={library.onSearchMetadata}
              onNewCollectionWithGame={library.onNewCollectionWithGame}
              onStop={onStopGame}
            />
            <AnimatePresence initial={false}>
              {openGameId && (
                <GamePage
                  key={openGameId}
                  gameId={openGameId}
                  onPlay={library.onPlay}
                  onEdit={library.onEdit}
                  onSearchMetadata={library.onSearchMetadata}
                  onNewCollectionWithGame={library.onNewCollectionWithGame}
                  onStop={onStopGame}
                  onForceIdentify={onForceIdentify}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
        {overlays}
      </TooltipProvider>
    </MotionConfig>
  );
}
