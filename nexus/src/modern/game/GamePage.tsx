import * as React from "react";
import * as Radix from "radix-ui";
import { motion } from "motion/react";
import { ArrowLeft, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { EASE_OUT } from "@/lib/motion";
import { extractYoutubeId } from "@/lib/youtube";
import { setGameStatus, addGameToCollection, removeGameFromCollection } from "@/lib/gameActions";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useUiStore, type NavItem } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { useCollectionStore } from "@/stores/collectionStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { GameMetadata } from "@/components/GameDetail/GameMetadata";
import { SimilarGamesRow } from "@/components/GameDetail/SimilarGamesRow";
import { MasteryTierDetail } from "@/components/GameDetail/MasteryTierDetail";
import { HltbSection } from "@/components/GameDetail/HltbSection";
import { GameProgress } from "@/components/GameDetail/GameProgress";
import { GamePlayStats } from "@/components/GameDetail/GamePlayStats";
import { GameScreenshots } from "@/components/GameDetail/GameScreenshots";
import { GameTrailer } from "@/components/GameDetail/GameTrailer";
import { GameNotes } from "@/components/GameDetail/GameNotes";
import { LiveOnTwitch } from "@/components/GameDetail/LiveOnTwitch";
import { TwitchClipsRow } from "@/components/GameDetail/TwitchClipsRow";
import { GameTagsSection } from "@/components/Tags/GameTagsSection";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, dropdownMenuParts } from "@/components/ui/menu";
import type { GameMenuHandlers } from "@/modern/library/GameMenuItems";
import { GameActionBar } from "./GameActionBar";
import { RatingsColumn } from "./RatingsColumn";

export interface GamePageProps extends GameMenuHandlers {
  onStop: () => void;
  onForceIdentify: () => void;
}

const BACK_LABEL: Partial<Record<NavItem, string>> = {
  home: "Home",
  library: "Library",
  completed: "Completed",
  archive: "Archive",
  stats: "Stats",
  achievements: "Achievements",
  twitch: "Twitch",
  wrapped: "Wrapped",
};

/**
 * Full game page. It covers the current page instead of replacing it, so Back
 * returns to the same scroll position.
 */
export function GamePage({ gameId, ...props }: GamePageProps & { gameId: string }) {
  // gameId is a prop (not read from the store) so the page keeps its content while it fades out.
  const game = useGameStore((s) => s.games.find((g) => g.id === gameId) ?? null);

  React.useEffect(() => {
    // A hidden or removed game closes its page.
    if (!game && useUiStore.getState().detailOverlayGameId === gameId) {
      useUiStore.getState().setDetailOverlayGameId(null);
    }
  }, [gameId, game]);

  if (!game) return null;
  return <GamePageBody game={game} {...props} />;
}

function GamePageBody({ game, onStop, onForceIdentify, ...menu }: GamePageProps & { game: Game }) {
  const activeNav = useUiStore((s) => s.activeNav);
  const twitchEnabled = useSettingsStore((s) => s.twitchEnabled);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [tab, setTab] = React.useState("overview");

  const close = React.useCallback(() => useUiStore.getState().setDetailOverlayGameId(null), []);

  // Opening the page closes quick view; focus moves in and returns on close.
  React.useEffect(() => {
    useUiStore.getState().setQuickViewGameId(null);
    const previous = document.activeElement as HTMLElement | null;
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[data-radix-popper-content-wrapper],[role="dialog"],[role="alertdialog"]')) return;
      const t = e.target;
      if (t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      close();
    };
    // Mouse "back" button.
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mouseup", onMouse);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mouseup", onMouse);
    };
  }, [close]);

  const youtubeId = game.trailerUrl ? extractYoutubeId(game.trailerUrl) : null;
  const screenshots = game.screenshotUrls ?? [];
  const hasMedia = screenshots.length > 0 || !!youtubeId;
  const genres = Array.isArray(game.genres) ? game.genres : [];
  const parsedYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : NaN;
  const year = Number.isFinite(parsedYear) ? parsedYear : null;
  const art = game.heroUrl ?? game.coverUrl;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "sessions", label: "Sessions" },
    ...(hasMedia ? [{ id: "media", label: "Media" }] : []),
    { id: "notes", label: "Notes" },
    ...(twitchEnabled ? [{ id: "twitch", label: "Twitch" }] : []),
  ];

  return (
    <motion.div
      ref={rootRef}
      tabIndex={-1}
      role="region"
      aria-label={game.name}
      data-testid="game-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.18, ease: EASE_OUT } }}
      exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
      className="absolute inset-0 z-10 overflow-y-auto overflow-x-hidden bg-background outline-none"
    >
      <header className="relative flex h-[clamp(260px,42vh,380px)] flex-col justify-between overflow-hidden">
        {art ? (
          <img
            src={art}
            alt=""
            draggable={false}
            className={cn("absolute inset-0 size-full object-cover", !game.heroUrl && "scale-110 blur-lg")}
          />
        ) : (
          <div aria-hidden className="absolute inset-0" style={{ background: placeholderGradient(game.name) }} />
        )}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-background/85 via-background/25 to-transparent" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />

        <div className="relative px-10 pt-5">
          <button
            type="button"
            data-testid="game-back"
            onClick={close}
            className="pressable flex h-9 items-center gap-1.5 rounded-lg border border-white/10 bg-black/45 pl-2 pr-3 text-sm font-medium text-white outline-none hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white"
          >
            <ArrowLeft className="size-4" strokeWidth={2} />
            {BACK_LABEL[activeNav] ?? "Back"}
          </button>
        </div>

        <div className="relative flex flex-col gap-2.5 px-10 pb-6">
          {game.logoUrl ? (
            <>
              <h1 className="sr-only">{game.name}</h1>
              <img src={game.logoUrl} alt="" className="max-h-24 max-w-[min(520px,60%)] object-contain object-left drop-shadow-xl" />
            </>
          ) : (
            <h1 className="max-w-3xl text-[44px] font-bold leading-[1.02] tracking-[-0.02em] text-foreground drop-shadow-lg">
              {game.name}
            </h1>
          )}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-foreground/80">
            <span className="rounded-md bg-black/45 px-2 py-0.5 font-medium capitalize text-white">{game.source}</span>
            {genres.slice(0, 3).map((g) => (
              <span key={g}>{g}</span>
            ))}
            {year && <span className="tabular-nums">{year}</span>}
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-10 py-3">
        <GameActionBar game={game} onStop={onStop} onForceIdentify={onForceIdentify} {...menu} />
      </div>

      <Radix.Tabs.Root value={tab} onValueChange={setTab} className="px-10 pb-12 pt-5">
        <Radix.Tabs.List aria-label="Game sections" className="flex flex-wrap gap-x-6 border-b border-border">
          {tabs.map((t) => (
            <Radix.Tabs.Trigger
              key={t.id}
              value={t.id}
              data-testid={`game-tab-${t.id}`}
              className={cn(
                "-mb-px border-b-2 border-transparent pb-3 pt-1 text-sm font-medium text-muted-foreground outline-none transition-[color,border-color] duration-150",
                "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                "data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-foreground",
              )}
            >
              {t.label}
            </Radix.Tabs.Trigger>
          ))}
        </Radix.Tabs.List>

        <Radix.Tabs.Content value="overview" className="pt-6 outline-none">
          {/* Content, then two equal side columns: ratings + dates, and your play. */}
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6">
              {game.description && <About text={game.description} />}
              <GameMetadata game={game} />
              <SimilarGamesRow igdbId={game.igdbId} />
            </div>
            <div className="min-w-0 max-w-[360px] flex-[1_1_300px]">
              <RatingsColumn game={game} />
            </div>
            <aside aria-label="Your play" className="flex min-w-0 max-w-[360px] flex-[1_1_300px] flex-col gap-4">
              <MasteryTierDetail gameId={game.id} />
              <HltbSection game={game} />
              <GameProgress game={game} onStatusChange={(s) => setGameStatus(game.id, s)} />
              <GameTagsSection gameId={game.id} />
              <CollectionsCard game={game} onNewCollectionWithGame={menu.onNewCollectionWithGame} />
            </aside>
          </div>
        </Radix.Tabs.Content>
        <Radix.Tabs.Content value="sessions" className="pt-6 outline-none">
          <GamePlayStats game={game} />
        </Radix.Tabs.Content>
        {hasMedia && (
          <Radix.Tabs.Content value="media" className="flex flex-col gap-6 pt-6 outline-none">
            <GameScreenshots screenshots={screenshots} />
            {youtubeId && <GameTrailer youtubeId={youtubeId} />}
          </Radix.Tabs.Content>
        )}
        <Radix.Tabs.Content value="notes" className="pt-6 outline-none">
          <GameNotes game={game} />
        </Radix.Tabs.Content>
        {twitchEnabled && (
          <Radix.Tabs.Content value="twitch" className="flex flex-col gap-6 pt-6 outline-none">
            <LiveOnTwitch gameName={game.name} />
            <TwitchClipsRow gameName={game.name} />
          </Radix.Tabs.Content>
        )}
      </Radix.Tabs.Root>
    </motion.div>
  );
}

function About({ text }: { text: string }) {
  const [expanded, setExpanded] = React.useState(false);
  const paragraphs = text.split("\n").filter(Boolean);
  const long = text.length > 600;
  return (
    <section aria-labelledby="game-about" className="flex flex-col gap-2.5">
      <h2 id="game-about" className="text-base font-semibold text-foreground">
        About
      </h2>
      <div className={cn("flex max-w-[72ch] flex-col gap-2 text-sm leading-relaxed text-muted-foreground", long && !expanded && "line-clamp-6")}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}

function CollectionsCard({ game, onNewCollectionWithGame }: { game: Game; onNewCollectionWithGame: (id: string) => void }) {
  const collections = useCollectionStore((s) => s.collections);
  const manual = collections.filter((c) => !c.isSmart).sort((a, b) => a.sortOrder - b.sortOrder);
  const inThese = collections.filter((c) => c.gameIds.includes(game.id));
  const M = dropdownMenuParts;
  return (
    <section aria-labelledby="game-collections" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 id="game-collections" className="text-sm font-semibold text-foreground">
        Collections
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {inThese.map((c) => (
          <span key={c.id} className="rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">
            {c.icon ? `${c.icon} ` : ""}
            {c.name}
          </span>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="game-collections-manage"
              className="pressable flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus className="size-3" strokeWidth={2} />
              {inThese.length > 0 ? "Manage" : "Add"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {manual.map((c) => {
              const inIt = c.gameIds.includes(game.id);
              return (
                <M.CheckboxItem
                  key={c.id}
                  checked={inIt}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => (inIt ? removeGameFromCollection(game.id, c.id) : addGameToCollection(game.id, c.id))}
                >
                  <span className="truncate">
                    {c.icon ? `${c.icon} ` : ""}
                    {c.name}
                  </span>
                </M.CheckboxItem>
              );
            })}
            {manual.length > 0 && <M.Separator />}
            <M.Item onSelect={() => onNewCollectionWithGame(game.id)}>New collection…</M.Item>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>
  );
}
