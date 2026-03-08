import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { RefreshCw, Search, X, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { listRunningProcesses, type RunningProcessInfo } from "@/lib/tauri";

export interface ProcessPickerModalProps {
  open: boolean;
  gameName: string;
  onProcessSelected: (exeName: string, pid: number) => void;
  onCancel: () => void;
}

export function ProcessPickerModal({
  open,
  gameName,
  onProcessSelected,
  onCancel,
}: ProcessPickerModalProps) {
  const [processes, setProcesses] = React.useState<RunningProcessInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(-1);
  const [confirmCancel, setConfirmCancel] = React.useState(false);

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout>>();

  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  React.useEffect(() => {
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const filtered = React.useMemo(() => {
    if (!debouncedSearch) return processes;
    const q = debouncedSearch.toLowerCase();
    return processes.filter(
      (p) =>
        p.exeName.toLowerCase().includes(q) ||
        (p.windowTitle && p.windowTitle.toLowerCase().includes(q)),
    );
  }, [processes, debouncedSearch]);

  const fetchProcesses = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await listRunningProcesses(false);
      setProcesses(result);
    } catch {
      setProcesses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedIndex(-1);
      setConfirmCancel(false);
      fetchProcesses();
    }
  }, [open, fetchProcesses]);

  React.useEffect(() => {
    if (open && !loading) {
      searchInputRef.current?.focus();
    }
  }, [open, loading]);

  React.useEffect(() => {
    setSelectedIndex(-1);
  }, [debouncedSearch]);

  const scrollSelectedIntoView = React.useCallback((index: number) => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll<HTMLElement>(
      '[data-testid^="process-item-"]',
    );
    const el = items[index];
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const handleConfirm = React.useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filtered.length) {
      const p = filtered[selectedIndex];
      onProcessSelected(p.exeName, p.pid);
    }
  }, [selectedIndex, filtered, onProcessSelected]);

  const handleCancelClick = React.useCallback(() => {
    if (confirmCancel) {
      onCancel();
    } else {
      setConfirmCancel(true);
    }
  }, [confirmCancel, onCancel]);

  const handleKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (confirmCancel) {
          setConfirmCancel(false);
        } else {
          onCancel();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.min(prev + 1, filtered.length - 1);
          scrollSelectedIntoView(next);
          return next;
        });
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => {
          const next = Math.max(prev - 1, 0);
          scrollSelectedIntoView(next);
          return next;
        });
        return;
      }

      if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        handleConfirm();
      }
    },
    [filtered.length, selectedIndex, confirmCancel, onCancel, handleConfirm, scrollSelectedIntoView],
  );

  React.useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, handleKeyDown]);

  const skeletonRows = Array.from({ length: 6 });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="process-picker-backdrop"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label={`Select the process for ${gameName}`}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onCancel}
            data-testid="process-picker-overlay"
          />

          <motion.div
            data-testid="process-picker-modal"
            className={cn(
              "relative z-10 flex max-h-[80vh] w-full max-w-[560px] flex-col rounded-xl",
              "bg-[hsla(240,10%,7%,0.85)] backdrop-blur-[24px]",
              "border border-border shadow-2xl",
            )}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-base font-semibold text-foreground">
                Select the process for{" "}
                <span className="text-primary">{gameName}</span>
              </h2>
              <button
                data-testid="process-picker-close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={onCancel}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Search + Refresh */}
            <div className="flex items-center gap-2 border-b border-border px-6 py-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  data-testid="process-picker-search"
                  type="text"
                  placeholder="Filter by name or window title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={cn(
                    "h-8 w-full rounded-md border border-border bg-background/50 pl-8 pr-3 text-sm text-foreground",
                    "placeholder:text-muted-foreground",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                  )}
                  aria-label="Filter processes"
                />
              </div>
              <Button
                data-testid="process-picker-refresh"
                variant="outline"
                size="icon-sm"
                onClick={fetchProcesses}
                disabled={loading}
                aria-label="Refresh process list"
              >
                <RefreshCw
                  className={cn("size-4", loading && "animate-spin")}
                />
              </Button>
            </div>

            {/* Process List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto px-2 py-2"
              style={{ maxHeight: "400px" }}
              role="listbox"
              aria-label="Running processes"
            >
              {loading ? (
                skeletonRows.map((_, i) => (
                  <div
                    key={i}
                    data-testid={`process-skeleton-${i}`}
                    className="flex items-center gap-3 rounded-lg px-4 py-2.5"
                  >
                    <div className="size-5 animate-pulse rounded bg-muted" />
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-48 animate-pulse rounded bg-muted" />
                    </div>
                  </div>
                ))
              ) : filtered.length === 0 ? (
                <div
                  data-testid="process-picker-empty"
                  className="flex flex-col items-center gap-2 py-10 text-center"
                >
                  <Monitor className="size-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No processes found. Try refreshing.
                  </p>
                </div>
              ) : (
                filtered.map((proc, i) => (
                  <div
                    key={`${proc.exeName}-${proc.pid}`}
                    data-testid={`process-item-${proc.pid}`}
                    role="option"
                    aria-selected={selectedIndex === i}
                    tabIndex={-1}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-4 py-2.5 transition-colors duration-100",
                      selectedIndex === i
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                    )}
                    onClick={() => setSelectedIndex(i)}
                    onDoubleClick={() => {
                      setSelectedIndex(i);
                      onProcessSelected(proc.exeName, proc.pid);
                    }}
                  >
                    <Monitor className="size-4 shrink-0" aria-hidden />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {proc.exeName}
                      </span>
                      {proc.windowTitle && (
                        <span className="truncate text-xs text-muted-foreground">
                          {proc.windowTitle}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                      PID {proc.pid}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              {!confirmCancel ? (
                <Button
                  data-testid="process-picker-cancel"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelClick}
                >
                  None of these / Cancel
                </Button>
              ) : (
                <div
                  data-testid="process-picker-cancel-confirm"
                  className="flex items-center gap-2 rounded-md border border-destructive bg-destructive/10 px-3 py-1.5"
                >
                  <span className="text-xs text-foreground">
                    End this play session?
                  </span>
                  <Button
                    data-testid="process-picker-cancel-yes"
                    size="xs"
                    variant="destructive"
                    onClick={onCancel}
                  >
                    Yes, end
                  </Button>
                  <Button
                    data-testid="process-picker-cancel-no"
                    size="xs"
                    variant="secondary"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Go back
                  </Button>
                </div>
              )}
              <Button
                data-testid="process-picker-confirm"
                size="sm"
                disabled={selectedIndex < 0}
                onClick={handleConfirm}
              >
                Confirm
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
