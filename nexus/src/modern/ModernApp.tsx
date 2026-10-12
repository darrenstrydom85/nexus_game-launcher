import * as React from "react";
import { AnimatePresence, MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { TopBar } from "./shell/TopBar";
import { NowPlayingStrip } from "./shell/NowPlayingStrip";
import { LibraryPage, type LibraryPageProps } from "./library/LibraryPage";
import { QuickViewDrawer } from "./library/QuickViewDrawer";
import { GamePage } from "./game/GamePage";

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
  onOpenSettings: () => void;
  onOpenUpdate: () => void;
}

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
}: ModernAppProps) {
  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const activeNav = useUiStore((s) => s.activeNav);
  const openGameId = useUiStore((s) => s.detailOverlayGameId);

  React.useEffect(() => {
    useUiStore.getState().setActiveNav("home");
  }, []);

  const isLibrary = activeNav === "library" || activeNav === "completed" || activeNav === "archive";

  return (
    <MotionConfig reducedMotion={enableAnimations ? "user" : "always"}>
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
          </div>
          <div className="relative flex min-h-0 flex-1 overflow-hidden">
            {/* Inert while a game page covers it, so Tab can't wander underneath. */}
            <main
              data-testid="modern-main"
              // React 19 supports `inert`; the installed types predate it.
              {...({ inert: openGameId !== null } as React.HTMLAttributes<HTMLElement>)}
              className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden"
            >
              {activeNav === "home" ? <HomePlaceholder /> : isLibrary ? <LibraryPage {...library} /> : page}
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

// ponytail: placeholder until the Home phase builds the spotlight + dashboard.
function HomePlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-12 text-center">
      <p className="text-base font-semibold text-foreground">Home is on its way</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        The spotlight and dashboard arrive in a later phase. Everything else in the top bar works today.
      </p>
    </div>
  );
}
