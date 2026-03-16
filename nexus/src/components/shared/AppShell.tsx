import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import { Titlebar } from "./Titlebar";
import { Sidebar } from "./Sidebar";
import { type Collection } from "@/stores/collectionStore";
import { NowPlaying } from "./NowPlaying";
import { ChevronLeft, ChevronRight, Menu, Settings, X } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { AnimatePresence, motion } from "motion/react";
import { HardwareBranding } from "./HardwareBranding";

const SIDEBAR_EXPANDED = 240;
const SIDEBAR_COLLAPSED = 64;
const BP_COMPACT = 1000;
const BP_MINIMAL = 800;

interface AppShellProps {
  children: React.ReactNode;
  onSettingsClick?: () => void;
  onAddCollection?: () => void;
  onEditCollection?: (collection: Collection) => void;
  onDeleteCollection?: (collection: Collection) => void;
  onStopGame?: () => void;
  onGameDetails?: (gameId: string) => void;
  onForceIdentify?: () => void;
  hasPlayHistory?: boolean;
  onPlayGame?: (gameId: string) => void;
}

export function AppShell({ children, onSettingsClick, onAddCollection, onEditCollection, onDeleteCollection, onStopGame, onGameDetails, onForceIdentify, hasPlayHistory, onPlayGame }: AppShellProps) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const healthIssueCount = useSettingsStore((s) => s.healthCheckIssueCount);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const setSidebarVisible = useUiStore((s) => s.setSidebarVisible);
  const activeNav = useUiStore((s) => s.activeNav);
  const setActiveNav = useUiStore((s) => s.setActiveNav);
  const toggleSourceFilter = useUiStore((s) => s.toggleSourceFilter);
  const [windowWidth, setWindowWidth] = React.useState(
    typeof window !== "undefined" ? window.innerWidth : 1400,
  );

  React.useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const prevWidthRef = React.useRef(windowWidth);
  React.useEffect(() => {
    const wasAboveCompact = prevWidthRef.current >= BP_COMPACT;
    const isBelowCompact = windowWidth < BP_COMPACT;
    if (wasAboveCompact && isBelowCompact && sidebarOpen) {
      setSidebarOpen(false);
    }
    prevWidthRef.current = windowWidth;
  }, [windowWidth, sidebarOpen, setSidebarOpen]);

  const layout = React.useMemo(() => {
    if (windowWidth >= 1400) return "full" as const;
    if (windowWidth >= BP_COMPACT) return "compact" as const;
    if (windowWidth >= BP_MINIMAL) return "minimal" as const;
    return "minimal" as const;
  }, [windowWidth]);

  const showSidebar = layout !== "minimal";
  const sidebarWidth = sidebarOpen ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED;

  React.useEffect(() => {
    setSidebarVisible(showSidebar);
  }, [showSidebar, setSidebarVisible]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background" data-testid="app-shell">
      <Titlebar />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {showSidebar && (
          <aside
            data-testid="app-shell-sidebar"
            className={cn(
              "glass-sidebar flex shrink-0 flex-col transition-[width] duration-200 ease-in-out",
            )}
            style={{ width: sidebarWidth }}
          >
            <NowPlaying onStop={onStopGame} onDetails={onGameDetails} onForceIdentify={onForceIdentify} />

            <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
              <Sidebar
                activeNav={activeNav}
                onNavigate={setActiveNav}
                onToggleSource={toggleSourceFilter}
                onAddCollection={onAddCollection}
                onEditCollection={onEditCollection}
                onDeleteCollection={onDeleteCollection}
                hasPlayHistory={hasPlayHistory}
                onPlayGame={onPlayGame}
              />
            </div>

            <HardwareBranding sidebarOpen={sidebarOpen} />

            <button
              data-testid="settings-button"
              className={cn(
                "flex h-11 items-center gap-3 border-t border-border py-0.5",
                "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                sidebarOpen ? "px-3" : "justify-center",
              )}
              onClick={onSettingsClick}
              title={!sidebarOpen ? "Settings" : undefined}
              aria-label="Settings"
            >
              <span className="relative">
                <Settings className="size-4" />
                {healthIssueCount > 0 && (
                  <span
                    data-testid="settings-health-badge"
                    className="absolute -right-1 -top-1 size-2 rounded-full bg-warning"
                    aria-label={`${healthIssueCount} library health issues`}
                  />
                )}
              </span>
              {sidebarOpen && <span className="text-sm">Settings</span>}
            </button>

            <button
              data-testid="sidebar-collapse-toggle"
              className={cn(
                "flex h-10 items-center justify-center",
                "border-t border-border text-muted-foreground transition-colors",
                "hover:bg-accent hover:text-foreground",
              )}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            >
              {sidebarOpen ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          </aside>
        )}

        {/* Minimal layout hamburger + slide-over drawer */}
        {layout === "minimal" && (
          <>
            <button
              data-testid="hamburger-menu"
              className={cn(
                "fixed left-3 top-12 z-50 flex size-9 items-center justify-center rounded-md",
                "bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              )}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              <Menu className="size-4" />
            </button>

            <AnimatePresence>
              {sidebarOpen && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    data-testid="drawer-backdrop"
                    className="fixed inset-0 z-[60] bg-black/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onClick={() => setSidebarOpen(false)}
                  />

                  {/* Drawer panel */}
                  <motion.aside
                    data-testid="drawer-sidebar"
                    className="glass-sidebar fixed inset-y-0 left-0 z-[70] flex w-[260px] flex-col"
                    initial={{ x: "-100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "-100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                  >
                    <div className="flex h-10 items-center justify-end px-3">
                      <button
                        data-testid="drawer-close"
                        className={cn(
                          "flex size-8 items-center justify-center rounded-md",
                          "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        )}
                        onClick={() => setSidebarOpen(false)}
                        aria-label="Close menu"
                      >
                        <X className="size-4" />
                      </button>
                    </div>

                    <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
                      <Sidebar
                        activeNav={activeNav}
                        onNavigate={(item) => {
                          setActiveNav(item);
                          setSidebarOpen(false);
                        }}
                        onToggleSource={toggleSourceFilter}
                        onAddCollection={() => {
                          onAddCollection?.();
                          setSidebarOpen(false);
                        }}
                        onEditCollection={onEditCollection}
                        onDeleteCollection={onDeleteCollection}
                        hasPlayHistory={hasPlayHistory}
                      />
                    </div>

                    <HardwareBranding sidebarOpen={true} />

                    <button
                      data-testid="settings-button"
                      className={cn(
                        "flex h-11 items-center gap-3 border-t border-border px-3 py-0.5",
                        "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      onClick={() => {
                        onSettingsClick?.();
                        setSidebarOpen(false);
                      }}
                      aria-label="Settings"
                    >
                      <span className="relative">
                        <Settings className="size-4" />
                        {healthIssueCount > 0 && (
                          <span
                            data-testid="settings-health-badge"
                            className="absolute -right-1 -top-1 size-2 rounded-full bg-warning"
                          />
                        )}
                      </span>
                      <span className="text-sm">Settings</span>
                    </button>
                  </motion.aside>
                </>
              )}
            </AnimatePresence>
          </>
        )}

        {/* Main Content */}
        <main
          data-testid="app-shell-content"
          className="relative flex-1 overflow-y-auto overflow-x-hidden"
        >
          {children}

          {/* Floating Now Playing bar when sidebar is hidden */}
          {!showSidebar && (
            <div
              data-testid="floating-now-playing"
              className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3"
            >
              <NowPlaying onStop={onStopGame} onDetails={onGameDetails} onForceIdentify={onForceIdentify} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
