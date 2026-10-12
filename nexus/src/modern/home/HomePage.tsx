import type { Game } from "@/stores/gameStore";
import { useGameStore } from "@/stores/gameStore";
import { Spotlight } from "./Spotlight";
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

export interface HomePageProps {
  onPlay: (game: Game) => void;
  onStop: () => void;
  onOpenRandom: () => void;
  onResync: () => void;
  onOpenSettings: () => void;
}

/** Spotlight on what you're playing, then the dashboard. Tiles hide themselves when they have nothing to say. */
export function HomePage({ onPlay, onStop, onOpenRandom, onResync, onOpenSettings }: HomePageProps) {
  const hasGames = useGameStore((s) => s.games.length > 0);

  return (
    <div data-testid="home-page" className="flex flex-col">
      <Spotlight onPlay={onPlay} onStop={onStop} onResync={onResync} onOpenSettings={onOpenSettings} />
      {hasGames && (
        <div className="flex flex-col gap-4 px-10 pb-12 pt-2">
          <div className="flex flex-wrap gap-4">
            <div className="min-w-0 flex-[4_1_300px]">
              <UpNextTile onPlay={onPlay} />
            </div>
            <div className="min-w-0 flex-[5_1_340px]">
              <WeekTile />
            </div>
            <div className="min-w-0 flex-[3_1_240px]">
              <RandomTile onPlay={onPlay} onOpenWheel={onOpenRandom} />
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
        </div>
      )}
    </div>
  );
}
