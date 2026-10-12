import * as React from "react";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useSettingsStore } from "@/stores/settingsStore";
import { useUiStore } from "@/stores/uiStore";
import { TopBar } from "./shell/TopBar";
import { NowPlayingStrip } from "./shell/NowPlayingStrip";

interface ModernAppProps {
  /** Page for the current nav. Phases replace these with modern pages one by one. */
  page: React.ReactNode;
  /** Game detail for `detailOverlayGameId` (overlay until the Game page lands). */
  gameDetail: React.ReactNode;
  /** Dialogs, toasts and prompts shared with the classic shell. */
  overlays: React.ReactNode;
  onStopGame: () => void;
  onForceIdentify: () => void;
  onResync: () => void;
  isSyncing: boolean;
  onOpenSettings: () => void;
  onOpenUpdate: () => void;
}

/** v1.0 shell: top bar + now-playing strip + one scroll container. */
export function ModernApp({
  page,
  gameDetail,
  overlays,
  onStopGame,
  onForceIdentify,
  onResync,
  isSyncing,
  onOpenSettings,
  onOpenUpdate,
}: ModernAppProps) {
  const enableAnimations = useSettingsStore((s) => s.enableAnimations);
  const activeNav = useUiStore((s) => s.activeNav);

  React.useEffect(() => {
    useUiStore.getState().setActiveNav("home");
  }, []);

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
              onQuickView={(id) => useUiStore.getState().setDetailOverlayGameId(id)}
            />
          </div>
          <main data-testid="modern-main" className="relative flex-1 overflow-y-auto overflow-x-hidden">
            {activeNav === "home" ? <HomePlaceholder /> : page}
          </main>
        </div>
        {gameDetail}
        {overlays}
      </TooltipProvider>
    </MotionConfig>
  );
}

// ponytail: placeholder until P3 builds the spotlight + dashboard.
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
