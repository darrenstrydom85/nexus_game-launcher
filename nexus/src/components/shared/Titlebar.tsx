import * as React from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/uiStore";
import {
  Minus,
  Square,
  Copy,
  X,
  Search,
} from "lucide-react";
import nexusLogo20 from "@/assets/nexus-logo-20.png";

function getAppWindow() {
  return getCurrentWindow();
}

export function Titlebar() {
  const [isMaximized, setIsMaximized] = React.useState(false);
  const appWindowRef = React.useRef(getAppWindow());
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  const setActiveNav = useUiStore((s) => s.setActiveNav);

  React.useEffect(() => {
    const appWindow = appWindowRef.current;
    let cancelled = false;
    appWindow.isMaximized().then((max) => {
      if (!cancelled) setIsMaximized(max);
    });
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then((max) => {
        if (!cancelled) setIsMaximized(max);
      });
    });
    return () => {
      cancelled = true;
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleDoubleClick = React.useCallback(() => {
    appWindowRef.current.toggleMaximize();
  }, []);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [setSearchOpen]);

  return (
    <header
      data-testid="titlebar"
      data-tauri-drag-region
      className={cn(
        "flex h-10 shrink-0 select-none items-center justify-between",
        "border-b border-border bg-background/80 backdrop-blur-sm",
        "titlebar-drag-region",
      )}
      onDoubleClick={handleDoubleClick}
    >
      {/* Left: Logo + Title */}
      <div className="flex items-center gap-2 pl-3">
        <button
          type="button"
          className="titlebar-no-drag flex size-5 shrink-0 items-center justify-center rounded transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setActiveNav("library")}
          aria-label="Go to Library"
        >
          <img
            src={nexusLogo20}
            alt=""
            width={20}
            height={20}
            className="size-5"
          />
        </button>
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Nexus
        </span>
        <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-widest text-primary/70">
          Beta
        </span>
      </div>

      {/* Right: Search + Window Controls */}
      <div className="flex items-center titlebar-no-drag">

        <button
          data-testid="titlebar-search"
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          )}
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="size-4" />
        </button>

        <button
          data-testid="titlebar-minimize"
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          )}
          aria-label="Minimize"
          onClick={() => appWindowRef.current.minimize()}
        >
          <Minus className="size-4" />
        </button>

        <button
          data-testid="titlebar-maximize"
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          )}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          onClick={() => appWindowRef.current.toggleMaximize()}
        >
          {isMaximized ? (
            <Copy className="size-3.5" />
          ) : (
            <Square className="size-3.5" />
          )}
        </button>

        <button
          data-testid="titlebar-close"
          className={cn(
            "flex h-10 w-10 items-center justify-center",
            "text-muted-foreground transition-colors hover:bg-destructive hover:text-white",
          )}
          aria-label="Close"
          onClick={() => appWindowRef.current.close()}
        >
          <X className="size-4" />
        </button>
      </div>
    </header>
  );
}
