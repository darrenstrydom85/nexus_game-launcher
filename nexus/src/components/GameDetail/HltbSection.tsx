import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { searchHltb, type HltbSearchResult } from "@/lib/hltb";
import { RefreshCw, Search, ArrowRight, HelpCircle } from "lucide-react";
import { cn, formatHltbTime } from "@/lib/utils";
import { saveHltbData, clearHltbData } from "@/lib/tauri";
import { refreshGames } from "@/stores/gameStore";
import type { Game } from "@/stores/gameStore";

const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

interface HltbSectionProps {
  game: Game;
}

type FetchState = "idle" | "loading" | "done";

function isCacheFresh(fetchedAt: string | null): boolean {
  if (!fetchedAt) return false;
  const elapsed = Date.now() - new Date(fetchedAt).getTime();
  return elapsed < STALE_THRESHOLD_MS;
}

function hasAnyTime(game: Game): boolean {
  return (
    (game.hltbMainH != null && game.hltbMainH > 0) ||
    (game.hltbMainExtraH != null && game.hltbMainExtraH > 0) ||
    (game.hltbCompletionistH != null && game.hltbCompletionistH > 0)
  );
}

function formatAriaTime(hours: number | null): string {
  if (hours == null || hours <= 0) return "no data";
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h} hour${h !== 1 ? "s" : ""} ${m} minute${m !== 1 ? "s" : ""}`;
}

export function HltbSection({ game }: HltbSectionProps) {
  const [fetchState, setFetchState] = React.useState<FetchState>("idle");
  const [searched, setSearched] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const [searchMode, setSearchMode] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState(game.name);
  const [searchResults, setSearchResults] = React.useState<HltbSearchResult[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setSearchQuery(game.name);
  }, [game.name]);

  React.useEffect(() => {
    if (searchMode) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [searchMode]);

  const doFetch = React.useCallback(
    async (signal: AbortSignal) => {
      setFetchState("loading");
      try {
        const results = await searchHltb(game.name, signal);

        if (signal.aborted) return;

        if (results.length === 0) {
          await saveHltbData(game.id, "", null, null, null);
          await refreshGames();
          setSearched(true);
          setFetchState("done");
          setSearchMode(true);
          return;
        }

        const best = results.reduce((a, b) =>
          b.similarity > a.similarity ? b : a,
        );

        await saveHltbData(
          game.id,
          String(best.id),
          best.gameplayMain || null,
          best.gameplayMainExtra || null,
          best.gameplayCompletionist || null,
        );
        await refreshGames();
        setSearched(true);
        setFetchState("done");
      } catch (err: unknown) {
        if (signal.aborted) return;
        const msg = err instanceof Error ? err.message : "";
        if (msg === "Request cancelled" || (err instanceof DOMException && err.name === "AbortError")) {
          return;
        }
        console.error("[HltbSection] fetch error:", err);
        setFetchState("done");
        setSearched(true);
        setSearchMode(true);
      }
    },
    [game.id, game.name],
  );

  React.useEffect(() => {
    const fresh = isCacheFresh(game.hltbFetchedAt);
    if (fresh) {
      setSearched(true);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    doFetch(controller.signal);

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [game.id, game.hltbFetchedAt, doFetch]);

  const handleRefetch = React.useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearched(false);
    await clearHltbData(game.id);
    await refreshGames();
    doFetch(controller.signal);
  }, [game.id, doFetch]);

  const handleAttribution = React.useCallback(() => {
    if (game.hltbId) {
      openUrl(`https://howlongtobeat.com/game/${game.hltbId}`).catch(() => {});
    }
  }, [game.hltbId]);

  const handleManualSearch = React.useCallback(async () => {
    const trimmed = searchQuery.trim();
    if (!trimmed || searching) return;

    setSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const results = await searchHltb(trimmed);
      setSearchResults(results);
    } catch (err) {
      console.error("[HltbSection] manual search error:", err);
      setSearchResults([]);
      setSearchError("Search failed \u2014 HLTB may be temporarily unavailable.");
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searching]);

  const handlePickResult = React.useCallback(
    async (result: HltbSearchResult) => {
      setSaving(true);
      try {
        await saveHltbData(
          game.id,
          String(result.id),
          result.gameplayMain || null,
          result.gameplayMainExtra || null,
          result.gameplayCompletionist || null,
        );
        await refreshGames();
        setSearchMode(false);
        setSearchResults([]);
        setSearched(true);
      } finally {
        setSaving(false);
      }
    },
    [game.id],
  );

  const handleEnterSearchMode = React.useCallback(() => {
    setSearchMode(true);
    setSearchResults([]);
    setSearchError(null);
    setSearchQuery(game.name);
  }, [game.name]);

  const handleCancelSearch = React.useCallback(() => {
    setSearchMode(false);
    setSearchResults([]);
    setSearchError(null);
  }, []);

  const handleSearchKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleManualSearch();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        handleCancelSearch();
      }
    },
    [handleManualSearch, handleCancelSearch],
  );

  if (fetchState === "loading" && !searchMode) {
    return (
      <div
        data-testid="hltb-section"
        className="rounded-lg border border-border bg-card p-4"
        aria-label="How Long to Beat estimates"
      >
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          How Long to Beat
        </h3>
        <div className="flex flex-col gap-2.5" data-testid="hltb-skeleton">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-14 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (searchMode) {
    return (
      <div
        data-testid="hltb-section"
        className="rounded-lg border border-border bg-card p-4"
        aria-label="How Long to Beat search"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            How Long to Beat
          </h3>
          <button
            data-testid="hltb-search-cancel"
            className={cn(
              "text-xs text-muted-foreground transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            onClick={handleCancelSearch}
          >
            Cancel
          </button>
        </div>

        <div className="mb-3 flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchInputRef}
              data-testid="hltb-search-input"
              type="text"
              placeholder="Search game name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className={cn(
                "h-7 w-full rounded-md border border-border bg-background/50 pl-7 pr-2 text-xs text-foreground",
                "placeholder:text-muted-foreground",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              )}
              aria-label="Search HLTB"
            />
          </div>
          <button
            data-testid="hltb-search-submit"
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md border border-border",
              "text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
            onClick={handleManualSearch}
            disabled={searching || !searchQuery.trim()}
            aria-label="Search"
          >
            {searching ? (
              <RefreshCw className="size-3.5 animate-spin" />
            ) : (
              <ArrowRight className="size-3.5" />
            )}
          </button>
        </div>

        <div
          data-testid="hltb-search-results"
          className="max-h-[200px] overflow-y-auto"
          role="listbox"
          aria-label="HLTB search results"
        >
          {searching ? (
            <div className="flex flex-col gap-2 py-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between rounded px-2 py-1.5">
                  <div className="h-3.5 w-28 animate-pulse rounded bg-muted" />
                  <div className="h-3.5 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : searchError ? (
            <p
              data-testid="hltb-search-error"
              className="py-4 text-center text-xs text-destructive"
            >
              {searchError}
            </p>
          ) : searchResults.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  data-testid={`hltb-result-${result.id}`}
                  role="option"
                  aria-selected={false}
                  disabled={saving}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-left",
                    "transition-colors duration-100 hover:bg-primary/15",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                  onClick={() => handlePickResult(result)}
                >
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {result.name}
                  </span>
                  <span className="ml-2 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatHltbTime(result.gameplayMain)}
                    {result.gameplayMainExtra > 0 && (
                      <> / {formatHltbTime(result.gameplayMainExtra)}</>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p
              data-testid="hltb-search-empty"
              className="py-4 text-center text-xs text-muted-foreground"
            >
              {fetchState === "done" || searched
                ? "No results found. Try a different name."
                : "Search for a game above."}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!searched) return null;

  if (!hasAnyTime(game)) {
    return (
      <div
        data-testid="hltb-section"
        className="rounded-lg border border-border bg-card p-4"
        aria-label="How Long to Beat estimates"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            How Long to Beat
          </h3>
        </div>
        <div className="flex flex-col items-center gap-2 py-2">
          <p className="text-xs text-muted-foreground">
            No match found for this game.
          </p>
          <button
            data-testid="hltb-search-trigger"
            className={cn(
              "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground",
              "transition-colors hover:bg-white/5 hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            onClick={handleEnterSearchMode}
          >
            <Search className="size-3" />
            Search manually
          </button>
        </div>
      </div>
    );
  }

  const rows: { label: string; value: number | null; testId: string }[] = [
    { label: "Main Story", value: game.hltbMainH, testId: "hltb-main" },
    {
      label: "Main + Extras",
      value: game.hltbMainExtraH,
      testId: "hltb-main-extra",
    },
    {
      label: "Completionist",
      value: game.hltbCompletionistH,
      testId: "hltb-completionist",
    },
  ];

  return (
    <div
      data-testid="hltb-section"
      className="group/hltb rounded-lg border border-border bg-card p-4"
      aria-label="How Long to Beat estimates"
    >
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground">
          How Long to Beat
        </h3>
        {game.hltbId && (
          <button
            data-testid="hltb-attribution"
            className={cn(
              "text-xs text-muted-foreground transition-colors hover:text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            onClick={handleAttribution}
          >
            via HowLongToBeat
          </button>
        )}
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover/hltb:opacity-100 has-[:focus-visible]:opacity-100">
          <button
            data-testid="hltb-wrong-game"
            className={cn(
              "rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            onClick={handleEnterSearchMode}
            aria-label="Wrong game? Search manually"
            title="Wrong game?"
          >
            <HelpCircle className="size-3.5" />
          </button>
          <button
            data-testid="hltb-refetch"
            className={cn(
              "rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            onClick={handleRefetch}
            aria-label="Re-fetch HLTB data"
          >
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </div>

      <dl className="flex flex-col gap-2.5 text-sm">
        {rows.map((row) => (
          <div key={row.testId} className="flex justify-between">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              data-testid={row.testId}
              className="font-medium tabular-nums text-foreground"
              aria-label={`${row.label}: ${formatAriaTime(row.value)}`}
            >
              {formatHltbTime(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
