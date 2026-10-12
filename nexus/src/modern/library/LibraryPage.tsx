import * as React from "react";
import { LayoutGrid, List, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGames } from "@/hooks/useGames";
import { useUiStore, type SortField } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useFilterStore } from "@/stores/filterStore";
import { useTagStore } from "@/stores/tagStore";
import { useMasteryStore } from "@/stores/masteryStore";
import { useCollectionStore, type Collection } from "@/stores/collectionStore";
import { filterGames, hasActiveFilters, type LibraryFilters } from "@/lib/libraryFilter";
import { sortGames, SORT_OPTIONS } from "@/components/Library/GameGrid";
import { SyncProgressBanner } from "@/components/Library/SyncProgressBanner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, contextMenuParts } from "@/components/ui/menu";
import type { MasteryTierValue } from "@/lib/tauri";
import type { GameMenuHandlers } from "./GameMenuItems";
import { FilterChips } from "./FilterChips";
import { GameGridView } from "./GameGridView";
import { CompletedTab, EmptyState } from "./CompletedTab";
import { ArchiveTab } from "./ArchiveTab";

export interface LibraryPageProps extends GameMenuHandlers {
  onNewCollection: () => void;
  onEditCollection: (c: Collection) => void;
  onDeleteCollection: (c: Collection) => void;
  onOpenSettings: () => void;
  onResync: () => void;
  syncResult: { added: number; updated: number } | null;
}

type Tab = { kind: "all" } | { kind: "completed" } | { kind: "archive" } | { kind: "collection"; id: string };

export function LibraryPage({
  onNewCollection,
  onEditCollection,
  onDeleteCollection,
  onOpenSettings,
  onResync,
  syncResult,
  ...menu
}: LibraryPageProps) {
  const { games, isLoading, error } = useGames();
  const activeNav = useUiStore((s) => s.activeNav);
  const viewMode = useUiStore((s) => s.viewMode);
  const sortField = useUiStore((s) => s.sortField);
  const sortDirection = useUiStore((s) => s.sortDirection);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const quickViewId = useUiStore((s) => s.quickViewGameId);
  const hiddenIds = useSettingsStore((s) => s.hiddenGameIds);
  const statuses = useFilterStore((s) => s.statuses);
  const tagIds = useFilterStore((s) => s.tags);
  const tiers = useFilterStore((s) => s.tiers);
  const minScore = useFilterStore((s) => s.minCriticScore);
  const maxScore = useFilterStore((s) => s.maxCriticScore);
  const gameTagMap = useTagStore((s) => s.gameTagMap);
  const masteryTiers = useMasteryStore((s) => s.tiers);
  const collections = useCollectionStore((s) => s.collections);
  const activeCollectionId = useCollectionStore((s) => s.activeCollectionId);
  const [pendingDelete, setPendingDelete] = React.useState<Collection | null>(null);

  const tab: Tab =
    activeNav === "completed"
      ? { kind: "completed" }
      : activeNav === "archive"
        ? { kind: "archive" }
        : activeCollectionId
          ? { kind: "collection", id: activeCollectionId }
          : { kind: "all" };

  const tierOf = React.useCallback(
    (id: string): MasteryTierValue => masteryTiers.get(id)?.tier ?? "none",
    [masteryTiers],
  );

  // Hidden games never show; archived ones only on the Archive tab.
  const visible = React.useMemo(() => games.filter((g) => !hiddenIds.includes(g.id)), [games, hiddenIds]);
  const installed = React.useMemo(() => visible.filter((g) => g.status !== "removed"), [visible]);
  const activeCollection = collections.find((c) => c.id === activeCollectionId) ?? null;

  const filters: LibraryFilters = {
    query: searchQuery,
    source: sourceFilter,
    genre: genreFilter,
    statuses,
    tagIds,
    minCriticScore: minScore,
    maxCriticScore: maxScore,
    tiers,
    collectionGameIds: tab.kind === "collection" ? (activeCollection?.gameIds ?? []) : null,
  };
  const filtered = React.useMemo(
    () => sortGames(filterGames(installed, filters, { gameTagMap, tierOf }), sortField, sortDirection),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [installed, searchQuery, sourceFilter, genreFilter, statuses, tagIds, minScore, maxScore, tiers, activeCollection, tab.kind, gameTagMap, tierOf, sortField, sortDirection],
  );

  const setQuickViewIds = useUiStore((s) => s.setQuickViewIds);
  React.useEffect(() => {
    if (tab.kind === "all" || tab.kind === "collection") setQuickViewIds(filtered.map((g) => g.id));
  }, [filtered, tab.kind, setQuickViewIds]);

  const openQuickView = React.useCallback((id: string) => useUiStore.getState().setQuickViewGameId(id), []);
  const openFull = React.useCallback((id: string) => useUiStore.getState().setDetailOverlayGameId(id), []);

  const goTo = (next: Tab) => {
    const ui = useUiStore.getState();
    const cs = useCollectionStore.getState();
    if (next.kind === "completed" || next.kind === "archive") {
      cs.setActiveCollectionId(null);
      ui.setActiveNav(next.kind);
    } else {
      cs.setActiveCollectionId(next.kind === "collection" ? next.id : null);
      ui.setActiveNav("library");
    }
  };

  const sortedCollections = React.useMemo(
    () => [...collections].sort((a, b) => Number(a.isSmart) - Number(b.isSmart) || a.sortOrder - b.sortOrder),
    [collections],
  );
  const completedCount = visible.filter((g) => g.completed).length;
  const archiveCount = visible.filter((g) => g.status === "removed").length;
  const sources = new Set(installed.map((g) => g.source)).size;
  const isFiltered = hasActiveFilters(filters);

  const clearFilters = () => {
    const ui = useUiStore.getState();
    ui.setSearchQuery("");
    ui.setSourceFilter(null);
    ui.setGenreFilter(null);
    useFilterStore.getState().clearAll();
  };

  const gridProps = {
    viewMode,
    selectedId: quickViewId,
    onOpen: openQuickView,
    onOpenFull: openFull,
    ...menu,
  };

  return (
    <div data-testid="library-page" className="relative flex flex-col">
      <div className="sticky top-0 z-[20] h-0 overflow-visible">
        <SyncProgressBanner />
      </div>

      <div className="flex flex-col gap-0 px-6 pt-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border">
          <div className="flex min-w-0 flex-col gap-3.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-foreground">Library</h1>
              <span className="text-[13px] text-muted-foreground">
                {installed.length} games · {sources} {sources === 1 ? "source" : "sources"}
              </span>
              {syncResult && (
                <span data-testid="sync-result" className="text-[13px] text-success">
                  Sync complete: {syncResult.added} added, {syncResult.updated} updated
                </span>
              )}
            </div>
            <div role="tablist" aria-label="Library views" className="flex flex-wrap items-center gap-x-5 gap-y-1">
              <TabButton active={tab.kind === "all"} onClick={() => goTo({ kind: "all" })} count={installed.length} testId="lib-tab-all">
                All games
              </TabButton>
              <TabButton active={tab.kind === "completed"} onClick={() => goTo({ kind: "completed" })} count={completedCount} testId="lib-tab-completed">
                Completed
              </TabButton>
              <TabButton active={tab.kind === "archive"} onClick={() => goTo({ kind: "archive" })} count={archiveCount} testId="lib-tab-archive">
                Archive
              </TabButton>
              {sortedCollections.length > 0 && <span aria-hidden className="mb-3 h-4 w-px self-end bg-border" />}
              {sortedCollections.map((c) => (
                <ContextMenu key={c.id}>
                  <ContextMenuTrigger asChild>
                    <TabButton
                      active={tab.kind === "collection" && tab.id === c.id}
                      onClick={() => goTo({ kind: "collection", id: c.id })}
                      count={c.gameIds.length}
                      testId={`lib-tab-collection-${c.id}`}
                    >
                      {c.icon ? <span aria-hidden>{c.icon} </span> : null}
                      {c.name}
                    </TabButton>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <contextMenuParts.Item onSelect={() => onEditCollection(c)}>Edit collection…</contextMenuParts.Item>
                    <contextMenuParts.Item
                      data-testid={`collection-delete-${c.id}`}
                      onSelect={() => setPendingDelete(c)}
                      className="text-destructive data-[highlighted]:text-destructive"
                    >
                      Delete collection…
                    </contextMenuParts.Item>
                  </ContextMenuContent>
                </ContextMenu>
              ))}
              <button
                type="button"
                data-testid="lib-new-collection"
                onClick={onNewCollection}
                className="pressable mb-3 flex items-center gap-1 self-end rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Plus className="size-3.5" strokeWidth={2} />
                New collection
              </button>
            </div>
          </div>

          {(tab.kind === "all" || tab.kind === "collection") && (
            <div className="flex items-center gap-2 pb-2.5">
              <Select value={sortField} onValueChange={(v) => useUiStore.getState().setSortField(v as SortField)}>
                <SelectTrigger aria-label="Sort games" data-testid="lib-sort" className="w-44">
                  <span className="text-muted-foreground">Sort</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <SegmentedControl
                aria-label="Layout"
                value={viewMode}
                onValueChange={(v) => useUiStore.getState().setViewMode(v)}
                options={[
                  { value: "grid", label: "Grid view", icon: <LayoutGrid className="size-3.5" strokeWidth={1.5} />, iconOnly: true },
                  { value: "list", label: "List view", icon: <List className="size-3.5" strokeWidth={1.5} />, iconOnly: true },
                ]}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-6 pb-10 pt-4">
        {error ? (
          <EmptyState title="Couldn't load your library" body={error} />
        ) : tab.kind === "completed" ? (
          <CompletedTab games={visible} onListChange={setQuickViewIds} {...gridProps} />
        ) : tab.kind === "archive" ? (
          <ArchiveTab games={visible} selectedId={quickViewId} onOpen={openQuickView} onListChange={setQuickViewIds} {...menu} />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterChips games={installed} tierOf={tierOf} />
              {isFiltered && (
                <span data-testid="lib-showing" className="text-[13px] tabular-nums text-muted-foreground">
                  Showing {filtered.length} of {installed.length}
                </span>
              )}
            </div>

            {isLoading && games.length === 0 ? (
              <SkeletonGrid />
            ) : installed.length === 0 ? (
              <EmptyState
                title="No games yet"
                body="Turn on your launchers or add a folder in Settings, then sync to fill your library."
                action={
                  <div className="flex gap-2">
                    <button type="button" onClick={onResync} className="pressable h-9 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
                      Sync library
                    </button>
                    <button type="button" onClick={onOpenSettings} className="pressable h-9 rounded-lg px-4 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
                      Open settings
                    </button>
                  </div>
                }
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title={tab.kind === "collection" && !isFiltered ? "This collection is empty" : "No games match"}
                body={
                  tab.kind === "collection" && !isFiltered
                    ? "Add games from their menu: right-click a cover, then Collections."
                    : "Try removing a filter."
                }
                action={
                  isFiltered ? (
                    <button
                      type="button"
                      data-testid="lib-clear-filters"
                      onClick={clearFilters}
                      className="pressable h-9 rounded-lg px-4 text-sm font-medium text-primary outline-none hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Clear filters
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <GameGridView games={filtered} {...gridProps} />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete "${pendingDelete?.name ?? ""}"?`}
        description="The collection is removed. The games stay in your library."
        confirmLabel="Delete collection"
        destructive
        onConfirm={() => {
          if (pendingDelete) onDeleteCollection(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}

const TabButton = React.forwardRef<
  HTMLButtonElement,
  {
    active: boolean;
    onClick: () => void;
    count: number;
    testId: string;
    children: React.ReactNode;
  } & React.ComponentPropsWithoutRef<"button">
>(function TabButton({ active, onClick, count, testId, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={active}
      data-testid={testId}
      onClick={onClick}
      {...rest}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 pb-3 text-sm outline-none transition-[color,border-color] duration-150",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary font-semibold text-foreground"
          : "border-transparent font-medium text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
      <span className={cn("tabular-nums", active ? "font-medium text-muted-foreground" : "text-muted-foreground/60")}>
        {count}
      </span>
    </button>
  );
});

function SkeletonGrid() {
  return (
    <div data-testid="lib-skeleton" className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-5 gap-y-6">
      {Array.from({ length: 12 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2.5">
          <div className="aspect-[2/3] rounded-xl bg-secondary motion-safe:animate-pulse" />
          <div className="h-3 w-3/4 rounded bg-secondary" />
          <div className="h-2.5 w-1/3 rounded bg-secondary" />
        </div>
      ))}
    </div>
  );
}
