import * as React from "react";
import { cn } from "@/lib/utils";
import { useUiStore, type NavItem } from "@/stores/uiStore";
import { useGameStore, type GameSource } from "@/stores/gameStore";
import { useFilterStore } from "@/stores/filterStore";
import { useTagStore } from "@/stores/tagStore";
import { useTwitchStore } from "@/stores/twitchStore";
import { useSettingsStore } from "@/stores/settingsStore";
import {
  Archive,
  BarChart3,
  ChevronDown,
  FolderOpen,
  Layers,
  Library,
  Shuffle,
  Star,
  Tag,
  Award,
  Trophy,
} from "lucide-react";
import { SOURCE_ICON_COMPONENTS } from "@/lib/source-icons";
import { TwitchIcon } from "@/lib/source-icons/TwitchIcon";
import { CollectionsSidebar } from "@/components/Collections/CollectionsSidebar";
import { type Collection } from "@/stores/collectionStore";
import { PlayQueueWidget } from "./PlayQueueWidget";
import { StreakWidget } from "@/components/Streak/StreakWidget";
import { LevelBadge } from "@/components/Xp/LevelBadge";
import { useAchievementStore } from "@/stores/achievementStore";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

export type { NavItem } from "@/stores/uiStore";

function ScoreRangeSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef<"min" | "max" | null>(null);

  const clamp = (v: number) => Math.max(0, Math.min(100, v));

  const posFromEvent = React.useCallback((e: PointerEvent) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return clamp(Math.round(((e.clientX - rect.left) / rect.width) * 100));
  }, []);

  const onPointerDown = (handle: "min" | "max") => (e: React.PointerEvent) => {
    e.preventDefault();
    dragging.current = handle;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const pos = posFromEvent(e);
      if (dragging.current === "min") {
        onChange(Math.min(pos, max - 1), max);
      } else {
        onChange(min, Math.max(pos, min + 1));
      }
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [min, max, onChange, posFromEvent]);

  const isActive = min > 0 || max < 100;

  return (
    <div className="flex flex-col gap-2 px-3 pb-2 pt-1">
      {/* Track */}
      <div
        ref={trackRef}
        data-testid="score-range-track"
        className="relative h-1.5 w-full rounded-full bg-secondary"
      >
        {/* Filled range */}
        <div
          className={cn(
            "absolute h-full rounded-full transition-colors duration-100",
            isActive ? "bg-primary" : "bg-muted-foreground/40",
          )}
          style={{ left: `${min}%`, width: `${max - min}%` }}
        />
        {/* Min handle */}
        <button
          data-testid="score-range-min-handle"
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "border-primary bg-background hover:bg-primary/20"
              : "border-muted-foreground/40 bg-background hover:border-primary",
          )}
          style={{ left: `${min}%` }}
          aria-label={`Minimum score: ${min}`}
          aria-valuemin={0}
          aria-valuemax={max - 1}
          aria-valuenow={min}
          role="slider"
          onPointerDown={onPointerDown("min")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onChange(Math.max(0, min - 1), max);
            if (e.key === "ArrowRight") onChange(Math.min(min + 1, max - 1), max);
          }}
        />
        {/* Max handle */}
        <button
          data-testid="score-range-max-handle"
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition-colors duration-100",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isActive
              ? "border-primary bg-background hover:bg-primary/20"
              : "border-muted-foreground/40 bg-background hover:border-primary",
          )}
          style={{ left: `${max}%` }}
          aria-label={`Maximum score: ${max}`}
          aria-valuemin={min + 1}
          aria-valuemax={100}
          aria-valuenow={max}
          role="slider"
          onPointerDown={onPointerDown("max")}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onChange(min, Math.max(max - 1, min + 1));
            if (e.key === "ArrowRight") onChange(min, Math.min(max + 1, 100));
          }}
        />
      </div>
      {/* Labels */}
      <div className="flex items-center justify-between">
        <span
          data-testid="score-range-min-label"
          className={cn(
            "text-xs tabular-nums transition-colors duration-100",
            isActive ? "text-primary font-medium" : "text-muted-foreground",
          )}
        >
          {min}
        </span>
        <span
          data-testid="score-range-max-label"
          className={cn(
            "text-xs tabular-nums transition-colors duration-100",
            isActive ? "text-primary font-medium" : "text-muted-foreground",
          )}
        >
          {max}
        </span>
      </div>
    </div>
  );
}

interface SidebarProps {
  activeNav?: NavItem;
  onNavigate?: (item: NavItem) => void;
  onAddCollection?: () => void;
  onEditCollection?: (collection: Collection) => void;
  onDeleteCollection?: (collection: Collection) => void;
  enabledSources?: GameSource[];
  onToggleSource?: (source: GameSource) => void;
  onPlayGame?: (gameId: string) => void;
}

export function Sidebar({
  activeNav = "library",
  onNavigate,
  onAddCollection,
  onEditCollection,
  onDeleteCollection,
  enabledSources,
  onToggleSource,
  onPlayGame,
}: SidebarProps) {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const sourceFilter = useUiStore((s) => s.sourceFilter);
  const genreFilter = useUiStore((s) => s.genreFilter);
  const toggleGenreFilter = useUiStore((s) => s.toggleGenreFilter);
  const games = useGameStore((s) => s.games);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const removedGameIds = useSettingsStore((s) => s.removedGameIds);
  const liveCount = useTwitchStore((s) => s.liveCount);
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);

  const minCriticScore = useFilterStore((s) => s.minCriticScore);
  const maxCriticScore = useFilterStore((s) => s.maxCriticScore);
  const setCriticScoreRange = useFilterStore((s) => s.setCriticScoreRange);

  const allTags = useTagStore((s) => s.tags);
  const filterTags = useFilterStore((s) => s.tags);
  const toggleTag = useFilterStore((s) => s.toggleTag);

  const [collectionsOpen, setCollectionsOpen] = React.useState(true);
  const [genresOpen, setGenresOpen] = React.useState(false);
  const [tagsOpen, setTagsOpen] = React.useState(false);
  const [scoreOpen, setScoreOpen] = React.useState(false);
  const [sourcesOpen, setSourcesOpen] = React.useState(false);
  const prevLiveCountRef = React.useRef(liveCount);
  const [badgePulse, setBadgePulse] = React.useState(false);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);

  const visibleGames = React.useMemo(
    () => games.filter((g) => !hiddenGameIds.includes(g.id) && g.status !== "removed"),
    [games, hiddenGameIds],
  );

  React.useEffect(() => {
    if (liveCount !== prevLiveCountRef.current) {
      prevLiveCountRef.current = liveCount;
      if (liveCount > 0 && !reducedMotion) {
        setBadgePulse(true);
        const t = setTimeout(() => setBadgePulse(false), 300);
        return () => clearTimeout(t);
      }
    }
  }, [liveCount, reducedMotion]);

  const genres = React.useMemo(() => {
    const genreSet = new Set<string>();
    visibleGames.forEach((g) => {
      const gs = Array.isArray(g.genres) ? g.genres : [];
      gs.forEach((genre) => genreSet.add(genre));
    });
    return Array.from(genreSet).slice(0, 10);
  }, [visibleGames]);

  const activeSources = React.useMemo(() => {
    const sourceSet = new Set(visibleGames.map((g) => g.source));
    return Array.from(sourceSet) as GameSource[];
  }, [visibleGames]);

  const completedCount = React.useMemo(
    () => games.filter((g) => g.completed).length,
    [games],
  );

  const achievementBadgeCount = useAchievementStore(
    (s) => s.statuses.filter((a) => a.unlocked).length,
  );

  const baseNavItems: { id: NavItem; label: string; icon: React.ReactNode }[] = [
    { id: "library", label: "Library", icon: <Library className="size-4" /> },
    { id: "stats", label: "Stats", icon: <BarChart3 className="size-4" /> },
    { id: "random", label: "Random", icon: <Shuffle className="size-4" /> },
    { id: "completed" as NavItem, label: "Completed", icon: <Trophy className="size-4" /> },
    { id: "archive" as NavItem, label: "Archive", icon: <Archive className="size-4" /> },
    { id: "achievements" as NavItem, label: "Achievements", icon: <Award className="size-4" /> },
    {
      id: "twitch" as NavItem,
      label: "Twitch",
      icon: (
        <span className="relative inline-flex shrink-0">
          <TwitchIcon className="size-4" />
          {!sidebarOpen && liveCount > 0 && isAuthenticated && (
            <span
              className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-500"
              aria-hidden
            />
          )}
        </span>
      ),
    },
  ];
  const navItems = twitchEnabled
    ? baseNavItems
    : baseNavItems.filter((item) => item.id !== "twitch");

  return (
    <nav
      data-testid="sidebar"
      className="flex h-full flex-col"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Level Badge — top of sidebar */}
      <div className="px-2 pt-2">
        <LevelBadge
          sidebarOpen={sidebarOpen}
          onClick={() => onNavigate?.("stats")}
        />
      </div>

      {/* Separator */}
      <div className="mx-3 mt-2 border-t border-border" />

      {/* Navigation Items */}
      <div className="flex flex-col gap-0.5 px-2 py-2" role="list">
        {navItems.map((item) => {
          const showBadge =
            item.id === "twitch" &&
            liveCount > 0 &&
            isAuthenticated;
          const archiveCount = removedGameIds.length;
          const showArchiveBadge = item.id === "archive" && archiveCount > 0;
          const showCompletedBadge = item.id === "completed" && completedCount > 0;
          const showAchievementBadge = item.id === "achievements" && achievementBadgeCount > 0;
          const twitchTitle =
            item.id === "twitch" && !sidebarOpen
              ? showBadge
                ? `Twitch (${liveCount} live)`
                : "Twitch"
              : undefined;
          const archiveTitle =
            item.id === "archive" && !sidebarOpen && archiveCount > 0
              ? `Archive (${archiveCount})`
              : undefined;
          const completedTitle =
            item.id === "completed" && !sidebarOpen && completedCount > 0
              ? `Completed (${completedCount})`
              : undefined;
          const ariaLabel =
            item.id === "twitch"
              ? showBadge
                ? `Twitch, ${liveCount} streamers live`
                : "Twitch"
              : item.id === "archive"
                ? archiveCount > 0
                  ? `Archive, ${archiveCount} games`
                  : "Archive"
                : item.id === "completed"
                  ? completedCount > 0
                    ? `Completed, ${completedCount} games`
                    : "Completed"
                  : undefined;
          return (
            <button
              key={item.id}
              data-testid={`nav-${item.id}`}
              role="listitem"
              className={cn(
                "relative flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                "text-muted-foreground hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeNav === item.id && "bg-accent text-foreground",
              )}
              onClick={() => onNavigate?.(item.id)}
              title={!sidebarOpen ? (twitchTitle ?? archiveTitle ?? completedTitle ?? item.label) : undefined}
              aria-current={activeNav === item.id ? "page" : undefined}
              aria-label={ariaLabel}
            >
              {activeNav === item.id && (
                <div
                  data-testid={`nav-${item.id}-indicator`}
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary"
                />
              )}
              {item.icon}
              {sidebarOpen && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {showBadge && (
                    <span
                      className={cn(
                        "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium tabular-nums text-white",
                        badgePulse && "animate-badge-pulse",
                      )}
                      aria-hidden
                    >
                      {liveCount}
                    </span>
                  )}
                  {showArchiveBadge && (
                    <span
                      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-muted-foreground/30 px-1 text-[10px] font-medium tabular-nums text-muted-foreground"
                      aria-hidden
                    >
                      {archiveCount}
                    </span>
                  )}
                  {showCompletedBadge && (
                    <span
                      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-medium tabular-nums text-primary"
                      aria-hidden
                    >
                      {completedCount}
                    </span>
                  )}
                  {showAchievementBadge && (
                    <span
                      className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[var(--rarity-legendary)]/20 px-1 text-[10px] font-medium tabular-nums text-[var(--rarity-legendary)]"
                      aria-hidden
                    >
                      {achievementBadgeCount}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </div>

      {/* Streak Widget */}
      <StreakWidget
        sidebarOpen={sidebarOpen}
        onNavigateToStats={() => onNavigate?.("stats")}
      />

      {/* Separator */}
      <div className="mx-3 border-t border-border" />

      {/* Play Queue widget */}
      <PlayQueueWidget
        sidebarOpen={sidebarOpen}
        onPlayGame={onPlayGame ?? (() => {})}
      />

      {/* Collections accordion */}
      <div className="flex flex-col px-2 py-1">
        <button
          data-testid="accordion-collections"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wider",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          onClick={() => sidebarOpen && setCollectionsOpen((o) => !o)}
          title={!sidebarOpen ? "Collections" : undefined}
          aria-expanded={collectionsOpen}
        >
          <FolderOpen className="size-3.5 shrink-0" />
          {sidebarOpen && (
            <>
              <span className="flex-1 text-left">Collections</span>
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-200",
                  collectionsOpen && "rotate-180",
                )}
              />
            </>
          )}
        </button>

        {sidebarOpen && collectionsOpen && (
          <div className="mt-0.5">
            <CollectionsSidebar
              onCreateCollection={onAddCollection}
              onEditCollection={onEditCollection}
              onDeleteCollection={onDeleteCollection}
            />
          </div>
        )}
      </div>

      {/* Genres accordion */}
      {genres.length > 0 && (
        <div className="flex flex-col px-2 py-1">
          <button
            data-testid="accordion-genres"
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wider",
              "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={() => sidebarOpen && setGenresOpen((o) => !o)}
            title={!sidebarOpen ? "Genres" : undefined}
            aria-expanded={genresOpen}
          >
            <Tag className="size-3.5 shrink-0" />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Genres</span>
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-200",
                    genresOpen && "rotate-180",
                  )}
                />
              </>
            )}
          </button>

          {sidebarOpen && genresOpen && (
            <div className="mt-0.5 flex flex-col gap-0.5" data-testid="genres-list" role="list">
              {genres.map((name) => (
                <button
                  key={name}
                  role="listitem"
                  className={cn(
                    "flex h-8 w-full items-center gap-3 rounded-md px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    genreFilter === name
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  )}
                  onClick={() => {
                  if (activeNav !== "library") onNavigate?.("library");
                  toggleGenreFilter(name);
                }}
                >
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tags accordion */}
      {allTags.length > 0 && (
        <div className="flex flex-col px-2 py-1">
          <button
            data-testid="accordion-tags"
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wider",
              "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filterTags.length > 0 && "text-primary",
            )}
            onClick={() => sidebarOpen && setTagsOpen((o) => !o)}
            title={!sidebarOpen ? "Tags" : undefined}
            aria-expanded={tagsOpen}
          >
            <Tag className="size-3.5 shrink-0" />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Tags</span>
                {filterTags.length > 0 && (
                  <span className="text-[10px] tabular-nums text-primary">
                    {filterTags.length}
                  </span>
                )}
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-200",
                    tagsOpen && "rotate-180",
                  )}
                />
              </>
            )}
          </button>

          {sidebarOpen && tagsOpen && (
            <div className="mt-0.5 flex flex-col gap-0.5" data-testid="tags-list" role="list">
              {allTags.map((tag) => (
                <button
                  key={tag.id}
                  role="listitem"
                  data-testid={`sidebar-tag-${tag.name}`}
                  className={cn(
                    "flex h-8 w-full items-center gap-3 rounded-md px-3 text-sm",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    filterTags.includes(tag.id)
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  )}
                  onClick={() => {
                    if (activeNav !== "library") onNavigate?.("library");
                    toggleTag(tag.id);
                  }}
                >
                  <span
                    className="inline-block size-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: tag.color || "#6B7280" }}
                  />
                  <span className="flex-1 truncate text-left">{tag.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {tag.gameCount}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Score range accordion */}
      <div className="flex flex-col px-2 py-1">
        <button
          data-testid="accordion-score"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wider",
            "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            (minCriticScore > 0 || maxCriticScore < 100) && "text-primary",
          )}
          onClick={() => sidebarOpen && setScoreOpen((o) => !o)}
          title={!sidebarOpen ? "Score filter" : undefined}
          aria-expanded={scoreOpen}
        >
          <Star className="size-3.5 shrink-0" />
          {sidebarOpen && (
            <>
              <span className="flex-1 text-left">Score</span>
              {(minCriticScore > 0 || maxCriticScore < 100) && (
                <span className="text-[10px] tabular-nums text-primary">
                  {minCriticScore}–{maxCriticScore}
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-3 transition-transform duration-200",
                  scoreOpen && "rotate-180",
                )}
              />
            </>
          )}
        </button>

        {sidebarOpen && scoreOpen && (
          <ScoreRangeSlider
            min={minCriticScore}
            max={maxCriticScore}
            onChange={setCriticScoreRange}
          />
        )}
      </div>

      {/* Separator */}
      <div className="mx-3 border-t border-border" />

      {/* Sources accordion */}
      {activeSources.length > 0 && (
        <div className="flex flex-col px-2 py-1">
          <button
            data-testid="accordion-sources"
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md px-3 text-xs font-medium uppercase tracking-wider",
              "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            onClick={() => sidebarOpen && setSourcesOpen((o) => !o)}
            title={!sidebarOpen ? "Sources" : undefined}
            aria-expanded={sourcesOpen}
          >
            <Layers className="size-3.5 shrink-0" />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">Sources</span>
                <ChevronDown
                  className={cn(
                    "size-3 transition-transform duration-200",
                    sourcesOpen && "rotate-180",
                  )}
                />
              </>
            )}
          </button>

          {sidebarOpen && sourcesOpen && (
            <div className="mt-0.5 flex flex-col gap-0.5">
              {activeSources.map((source) => {
                const isActive = sourceFilter === source;
                const isEnabled = enabledSources
                  ? enabledSources.includes(source)
                  : true;
                const count = visibleGames.filter((g) => g.source === source).length;
                const IconComponent = SOURCE_ICON_COMPONENTS[source];
                return (
                  <button
                    key={source}
                    data-testid={`source-filter-${source}`}
                    className={cn(
                      "flex h-8 w-full items-center gap-3 rounded-md px-3 text-left text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-accent text-foreground"
                        : isEnabled
                          ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                          : "text-muted-foreground opacity-50",
                    )}
                    onClick={() => {
                      if (activeNav !== "library") onNavigate?.("library");
                      onToggleSource?.(source);
                    }}
                    title={!sidebarOpen ? SOURCE_LABELS[source] : undefined}
                    aria-pressed={isActive || isEnabled}
                  >
                    <IconComponent className="size-4 shrink-0" />
                    {sidebarOpen && (
                      <>
                        <span className="flex-1">{SOURCE_LABELS[source]}</span>
                        <span className="text-xs text-muted-foreground">{count}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />
    </nav>
  );
}
