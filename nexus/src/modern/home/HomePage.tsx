import * as React from "react";
import type { Game } from "@/stores/gameStore";
import { useGameStore } from "@/stores/gameStore";
import { useGames } from "@/hooks/useGames";
import { useSettingsStore } from "@/stores/settingsStore";
import type { SettingsCategory } from "@/stores/uiStore";
import type { GameMenuHandlers } from "../library/GameMenuItems";
import { Spotlight } from "./Spotlight";
import { HomeSkeleton, HomeWelcome } from "./Welcome";
import {
  AchievementsTile,
  LevelTile,
  RandomTile,
  StreakTile,
  ThisPcTile,
  TwitchTile,
  UpNextTile,
  WeekTile,
} from "./Tiles";
import { GetStartedCard, LibraryGlanceTile, SHELF_META, Shelf } from "./Shelves";
import { criticsPicks, isFreshLibrary, jumpBackIn, newlyAdded, visibleGames, weekendGames } from "./homePicks";

export interface HomePageProps {
  onPlay: (game: Game) => void;
  onStop: () => void;
  onOpenRandom: () => void;
  onResync: () => void;
  onOpenSettings: (category?: SettingsCategory) => void;
  /** Context-menu actions for shelf posters, as in the library. */
  menu: GameMenuHandlers;
}

/**
 * Spotlight on what you're playing, then the dashboard and shelves. A fresh
 * launcher (nothing played yet) leads with a checklist, the shape of the
 * library and things worth starting instead of empty stats.
 */
export function HomePage({ onPlay, onStop, onOpenRandom, onResync, onOpenSettings, menu }: HomePageProps) {
  // Loads the library if nothing else has yet.
  const { error } = useGames();
  const games = useGameStore((s) => s.games);
  const hasLoaded = useGameStore((s) => s.hasLoaded);
  const hiddenIds = useSettingsStore((s) => s.hiddenGameIds);
  const visible = React.useMemo(() => visibleGames(games, hiddenIds), [games, hiddenIds]);
  const fresh = isFreshLibrary(visible);
  const shelves = React.useMemo(
    () => ({
      critics: criticsPicks(visible),
      weekend: weekendGames(visible),
      jumpBack: jumpBackIn(visible),
      added: newlyAdded(visible),
    }),
    [visible],
  );

  const critics = (
    <Shelf
      id="critics"
      title="Critics’ favourites you haven’t started"
      subtitle="Rated 80 or higher, waiting in your library"
      games={shelves.critics}
      meta={SHELF_META.critics}
      menu={menu}
    />
  );
  const weekend = (
    <Shelf
      id="weekend"
      title="Finish in a weekend"
      subtitle="Ten hours or less to beat the main story"
      games={shelves.weekend}
      meta={SHELF_META.weekend}
      menu={menu}
    />
  );

  // Still loading: a skeleton, never the empty-library welcome.
  if (games.length === 0 && !hasLoaded && !error) return <HomeSkeleton />;
  // The library didn't load: say so, rather than welcoming an "empty" library.
  if (games.length === 0 && error) {
    return (
      <div data-testid="home-error" className="flex min-h-full flex-col items-center justify-center gap-3 px-10 py-24 text-center">
        <p className="text-[17px] font-semibold text-foreground">Couldn’t load your library</p>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <button
          type="button"
          // Clearing the error lets useGames fetch again.
          onClick={() => useGameStore.getState().setError(null)}
          className="pressable mt-1 h-9 rounded-lg border border-input px-4 text-sm font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div data-testid="home-page" data-fresh={fresh} className="flex min-h-full flex-col">
      {visible.length === 0 ? (
        <HomeWelcome onResync={onResync} onAddFolder={() => onOpenSettings("library")} />
      ) : (
        <Spotlight onPlay={onPlay} onStop={onStop} />
      )}
      {visible.length > 0 &&
        (fresh ? (
          <div className="flex flex-col gap-10 px-10 pb-12 pt-2">
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 flex-[5_1_380px] empty:hidden">
                <GetStartedCard onOpenRandom={onOpenRandom} onOpenSettings={onOpenSettings} />
              </div>
              <div className="min-w-0 flex-[4_1_320px]">
                <LibraryGlanceTile games={visible} />
              </div>
              <div className="min-w-0 flex-[3_1_240px]">
                <RandomTile onPlay={onPlay} onOpenPack={onOpenRandom} />
              </div>
            </div>
            {critics}
            {weekend}
            <div className="flex flex-wrap gap-4 empty:hidden">
              <div className="min-w-0 flex-[4_1_300px] empty:hidden">
                <UpNextTile onPlay={onPlay} />
              </div>
              <div className="min-w-0 flex-[3_1_520px] empty:hidden">
                <TwitchTile />
              </div>
              <div className="min-w-0 flex-[1_1_260px] empty:hidden">
                <ThisPcTile />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 px-10 pb-12 pt-2">
            <div className="empty:hidden">
              <GetStartedCard onOpenRandom={onOpenRandom} onOpenSettings={onOpenSettings} />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 flex-[4_1_300px]">
                <UpNextTile onPlay={onPlay} />
              </div>
              <div className="min-w-0 flex-[5_1_340px]">
                <WeekTile />
              </div>
              <div className="min-w-0 flex-[3_1_240px]">
                <RandomTile onPlay={onPlay} onOpenPack={onOpenRandom} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 flex-[5_1_380px]">
                <StreakTile />
              </div>
              <div className="min-w-0 flex-[3_1_260px] empty:hidden">
                <LevelTile />
              </div>
              <div className="min-w-0 flex-[4_1_300px] empty:hidden">
                <AchievementsTile />
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="min-w-0 flex-[3_1_520px] empty:hidden">
                <TwitchTile />
              </div>
              <div className="min-w-0 flex-[1_1_260px] empty:hidden">
                <ThisPcTile />
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-10">
              <Shelf
                id="jump-back"
                title="Jump back in"
                subtitle="Started, then set aside for a while"
                games={shelves.jumpBack}
                meta={SHELF_META.jumpBack}
                menu={menu}
              />
              {weekend}
              {critics}
              <Shelf id="added" title="New in your library" subtitle="Added in the last 30 days" games={shelves.added} meta={SHELF_META.added} menu={menu} />
            </div>
          </div>
        ))}
    </div>
  );
}
