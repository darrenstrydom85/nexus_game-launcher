import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  searchMetadata,
  fetchMetadataWithIgdbId,
  searchSteamgridArtwork,
  applySteamgridArtwork,
  type MetadataSearchResult,
  type SteamGridSearchResult,
} from "@/lib/tauri";
import { Search, Loader2, X, ArrowLeft, Check } from "lucide-react";

interface MetadataSearchDialogProps {
  open: boolean;
  gameId: string;
  initialQuery: string;
  onClose: () => void;
  onSuccess: () => void;
}

function formatReleaseDate(ts: number | null): string {
  if (ts == null) return "";
  try {
    const d = new Date(ts * 1000);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

type Step = "igdb" | "artwork";

export function MetadataSearchDialog({
  open,
  gameId,
  initialQuery,
  onClose,
  onSuccess,
}: MetadataSearchDialogProps) {
  const [step, setStep] = React.useState<Step>("igdb");
  const [query, setQuery] = React.useState(initialQuery);
  const [results, setResults] = React.useState<MetadataSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [applyingId, setApplyingId] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [artworkQuery, setArtworkQuery] = React.useState("");
  const [artworkResults, setArtworkResults] = React.useState<
    SteamGridSearchResult[]
  >([]);
  const [artworkSearching, setArtworkSearching] = React.useState(false);
  const [applyingArtworkId, setApplyingArtworkId] = React.useState<
    number | null
  >(null);

  const prevStepRef = React.useRef<Step>("igdb");

  React.useEffect(() => {
    if (open) {
      setStep("igdb");
      setQuery(initialQuery);
      setResults([]);
      setError(null);
      setApplyingId(null);
      setArtworkQuery("");
      setArtworkResults([]);
      setApplyingArtworkId(null);
      prevStepRef.current = "igdb";
    }
  }, [open, initialQuery]);


  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleSearch = React.useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      const list = await searchMetadata(q);
      setResults(list);
      if (list.length === 0) {
        setError("No results. Try a different search term.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelectIgdb = React.useCallback(
    async (item: MetadataSearchResult) => {
      setApplyingId(item.id);
      setError(null);
      try {
        await fetchMetadataWithIgdbId(gameId, item.id, true);
        setArtworkQuery(item.name);
        setArtworkResults([]);
        setStep("artwork");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply metadata");
      } finally {
        setApplyingId(null);
      }
    },
    [gameId],
  );

  const handleSearchArtwork = React.useCallback(async () => {
    const q = artworkQuery.trim();
    if (!q) return;
    setArtworkSearching(true);
    setError(null);
    try {
      const list = await searchSteamgridArtwork(q);
      setArtworkResults(list);
      if (list.length === 0) {
        setError("No artwork found. Try a different search.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Artwork search failed");
      setArtworkResults([]);
    } finally {
      setArtworkSearching(false);
    }
  }, [artworkQuery]);

  // Auto-run first artwork search when user lands on artwork step (after choosing an IGDB result)
  React.useEffect(() => {
    if (
      step === "artwork" &&
      prevStepRef.current === "igdb" &&
      artworkQuery.trim()
    ) {
      handleSearchArtwork();
    }
    prevStepRef.current = step;
  }, [step, artworkQuery, handleSearchArtwork]);

  const handleSelectArtwork = React.useCallback(
    async (item: SteamGridSearchResult) => {
      setApplyingArtworkId(item.id);
      setError(null);
      try {
        await applySteamgridArtwork(gameId, item.id);
        await Promise.resolve(onSuccess());
        onClose();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to apply artwork",
        );
      } finally {
        setApplyingArtworkId(null);
      }
    },
    [gameId, onSuccess, onClose],
  );

  const handleSkipArtwork = React.useCallback(async () => {
    await Promise.resolve(onSuccess());
    onClose();
  }, [onSuccess, onClose]);

  const inputClass = cn(
    "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground",
    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="metadata-search-dialog"
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            data-testid="metadata-search-backdrop"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            data-testid="metadata-search-panel"
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-border bg-card shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-2">
                {step === "artwork" && (
                  <button
                    type="button"
                    data-testid="metadata-search-back"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => setStep("igdb")}
                    aria-label="Back to game search"
                  >
                    <ArrowLeft className="size-5" />
                  </button>
                )}
                <h2 className="text-lg font-semibold text-foreground">
                  {step === "igdb" ? "Search for game" : "Choose artwork"}
                </h2>
              </div>
              <button
                data-testid="metadata-search-close"
                type="button"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex shrink-0 flex-col gap-3 px-6 py-4">
              {step === "igdb" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Search IGDB when the game name does not find a match. Pick a
                    result to apply its metadata, then choose artwork from
                    SteamGridDB.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      data-testid="metadata-search-input"
                      className={inputClass}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Game name or keyword"
                      aria-label="Search query"
                    />
                    <Button
                      data-testid="metadata-search-button"
                      type="button"
                      variant="secondary"
                      onClick={handleSearch}
                      disabled={searching || !query.trim()}
                      aria-label="Search"
                    >
                      {searching ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Search className="size-4" />
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Search for artwork on SteamGridDB. Click{" "}
                    <strong className="text-foreground">Search</strong> to load
                    options below; you can change the name and search again for
                    different results. Click a result to apply that artwork to
                    this game, or skip to keep current.
                  </p>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        data-testid="artwork-search-input"
                        className={inputClass}
                        value={artworkQuery}
                        onChange={(e) => setArtworkQuery(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && handleSearchArtwork()
                        }
                        placeholder="Game name to search SteamGridDB"
                        aria-label="Artwork search query"
                      />
                      <Button
                        data-testid="artwork-search-button"
                        type="button"
                        variant="secondary"
                        onClick={handleSearchArtwork}
                        disabled={artworkSearching || !artworkQuery.trim()}
                        aria-label="Search for artwork options"
                      >
                        {artworkSearching ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <>
                            <Search className="size-4" />
                            <span className="ml-1.5">Search</span>
                          </>
                        )}
                      </Button>
                    </div>
                    <Button
                      data-testid="artwork-skip"
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSkipArtwork}
                      className="self-start"
                    >
                      Skip artwork
                    </Button>
                  </div>
                </>
              )}
              {error && (
                <p
                  data-testid="metadata-search-error"
                  className="text-sm text-destructive"
                >
                  {error}
                </p>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-6 py-4">
              {step === "artwork" && (
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Artwork options — click one to apply
                </p>
              )}
              {step === "igdb" && results.length > 0 && (
                <ul
                  className="flex flex-col gap-1"
                  role="listbox"
                  aria-label="Search results"
                >
                  {results.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-testid={`metadata-search-result-${item.id}`}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus:outline-none focus:ring-2 focus:ring-ring",
                          applyingId === item.id &&
                            "pointer-events-none opacity-60",
                        )}
                        onClick={() => handleSelectIgdb(item)}
                        disabled={applyingId !== null}
                      >
                        <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {item.name}
                          </span>
                          {item.releaseDate != null && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {formatReleaseDate(item.releaseDate)}
                            </span>
                          )}
                        </div>
                        {applyingId === item.id && (
                          <Loader2
                            className="size-4 shrink-0 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {step === "artwork" && artworkResults.length > 0 && (
                <ul
                  className="flex flex-col gap-1"
                  role="listbox"
                  aria-label="Artwork results"
                >
                  {artworkResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-testid={`artwork-result-${item.id}`}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left",
                          "hover:bg-accent hover:text-accent-foreground",
                          "focus:outline-none focus:ring-2 focus:ring-ring",
                          applyingArtworkId === item.id &&
                            "pointer-events-none opacity-60",
                        )}
                        onClick={() => handleSelectArtwork(item)}
                        disabled={applyingArtworkId !== null}
                      >
                        <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                          {item.coverUrl ? (
                            <img
                              src={item.coverUrl}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="h-full w-full" aria-hidden />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {item.name}
                          </span>
                          {item.verified && (
                            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <Check className="size-3" aria-hidden />
                              Verified
                            </span>
                          )}
                        </div>
                        {applyingArtworkId === item.id && (
                          <Loader2
                            className="size-4 shrink-0 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {step === "igdb" &&
                !searching &&
                results.length === 0 &&
                query.trim() &&
                !error && (
                  <p className="text-sm text-muted-foreground">
                    Click Search to find games on IGDB.
                  </p>
                )}
              {step === "artwork" && !artworkSearching && artworkResults.length === 0 && !error && (
                <p className="text-sm text-muted-foreground">
                  {artworkQuery.trim()
                    ? "No results yet. Change the search if needed and click Search above to load artwork options here."
                    : "Enter a game name above and click Search to load artwork options here."}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
