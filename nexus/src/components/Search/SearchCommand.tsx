import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { useSearch, type SearchResult } from "@/hooks/useSearch";
import { useUiStore } from "@/stores/uiStore";
import { Search, X } from "lucide-react";

interface SearchCommandProps {
  open: boolean;
  onClose: () => void;
  onSelectGame?: (gameId: string) => void;
  onSelectCollection?: (collectionId: string) => void;
  onSelectAction?: (actionId: string) => void;
}

export function SearchCommand({
  open,
  onClose,
  onSelectGame,
  onSelectCollection,
  onSelectAction,
}: SearchCommandProps) {
  const [query, setQuery] = React.useState("");
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const setDetailOverlayGameId = useUiStore((s) => s.setDetailOverlayGameId);

  const { results, gameResults, collectionResults, actionResults } = useSearch(query);

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && results[selectedIndex]) {
        handleSelect(results[selectedIndex]);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, results, selectedIndex]);

  const handleSelect = React.useCallback(
    (result: SearchResult) => {
      if (result.type === "game") {
        onSelectGame?.(result.id);
        setDetailOverlayGameId(result.id);
      } else if (result.type === "collection") {
        onSelectCollection?.(result.id);
      } else if (result.type === "action") {
        onSelectAction?.(result.id);
      }
      onClose();
    },
    [onSelectGame, onSelectCollection, onSelectAction, setDetailOverlayGameId, onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="search-command"
          className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            data-testid="search-panel"
            className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
            initial={{ scale: 0.95, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -10 }}
          >
            {/* Input */}
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="size-5 text-muted-foreground" />
              <input
                ref={inputRef}
                data-testid="search-input"
                className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                placeholder="Search games, collections, actions..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  data-testid="search-clear"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setQuery("")}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Results */}
            {results.length > 0 && (
              <div data-testid="search-results" className="max-h-[50vh] overflow-y-auto p-2">
                {gameResults.length > 0 && (
                  <div data-testid="search-group-games">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Games
                    </p>
                    {gameResults.map((r) => {
                      const globalIdx = results.indexOf(r);
                      return (
                        <button
                          key={r.id}
                          data-testid={`search-result-${r.id}`}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                            "hover:bg-accent",
                            globalIdx === selectedIndex && "bg-accent text-accent-foreground",
                          )}
                          onClick={() => handleSelect(r)}
                        >
                          {r.game?.coverUrl ? (
                            <img src={r.game.coverUrl} alt="" className="size-8 rounded object-cover" />
                          ) : (
                            <div className="flex size-8 items-center justify-center rounded bg-secondary text-xs">
                              {r.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex flex-1 flex-col text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{r.name}</span>
                              {r.noteSnippet && (
                                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                  Note match
                                </span>
                              )}
                            </div>
                            <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {collectionResults.length > 0 && (
                  <div data-testid="search-group-collections">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Collections
                    </p>
                    {collectionResults.map((r) => {
                      const globalIdx = results.indexOf(r);
                      return (
                        <button
                          key={r.id}
                          data-testid={`search-result-${r.id}`}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                            "hover:bg-accent",
                            globalIdx === selectedIndex && "bg-accent",
                          )}
                          onClick={() => handleSelect(r)}
                        >
                          <span className="text-base">{r.icon}</span>
                          <span>{r.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {actionResults.length > 0 && (
                  <div data-testid="search-group-actions">
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Actions
                    </p>
                    {actionResults.map((r) => {
                      const globalIdx = results.indexOf(r);
                      return (
                        <button
                          key={r.id}
                          data-testid={`search-result-${r.id}`}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm",
                            "hover:bg-accent",
                            globalIdx === selectedIndex && "bg-accent",
                          )}
                          onClick={() => handleSelect(r)}
                        >
                          <span className="text-base">{r.icon}</span>
                          <span>{r.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {query && results.length === 0 && (
              <div data-testid="search-empty" className="p-6 text-center text-sm text-muted-foreground">
                No results for "{query}"
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
