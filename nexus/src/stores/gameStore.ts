import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./settingsStore";

function normalizeImageUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:") || url.startsWith("asset:")) {
    return url;
  }
  try {
    return convertFileSrc(url);
  } catch {
    return url;
  }
}

export type GameSource =
  | "steam"
  | "epic"
  | "gog"
  | "ubisoft"
  | "battlenet"
  | "xbox"
  | "standalone";

export type GameStatus =
  | "playing"
  | "completed"
  | "backlog"
  | "dropped"
  | "wishlist"
  | "removed"
  | "unset";

export interface Game {
  id: string;
  name: string;
  source: GameSource;
  folderPath: string | null;
  exePath: string | null;
  exeName: string | null;
  launchUrl: string | null;
  igdbId: number | null;
  steamgridId: number | null;
  description: string | null;
  coverUrl: string | null;
  heroUrl: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  customCover: string | null;
  customHero: string | null;
  potentialExeNames: string | null;
  genres: string[];
  releaseDate: string | null;
  criticScore: number | null;
  criticScoreCount: number | null;
  communityScore: number | null;
  communityScoreCount: number | null;
  trailerUrl: string | null;
  status: GameStatus;
  rating: number | null;
  totalPlayTimeS: number;
  lastPlayedAt: string | null;
  playCount: number;
  addedAt: string;
  isHidden: boolean;
  hltbMainH: number | null;
  hltbMainExtraH: number | null;
  hltbCompletionistH: number | null;
  hltbId: string | null;
  hltbFetchedAt: string | null;
  notes: string | null;
  progress: number | null;
  milestonesJson: string | null;
}

interface BackendGame extends Omit<Game, "totalPlayTimeS" | "lastPlayedAt" | "playCount" | "genres" | "customCover" | "customHero" | "potentialExeNames" | "criticScore" | "criticScoreCount" | "communityScore" | "communityScoreCount" | "trailerUrl" | "hltbMainH" | "hltbMainExtraH" | "hltbCompletionistH" | "hltbId" | "hltbFetchedAt" | "progress" | "milestonesJson"> {
  totalPlayTime?: number;
  totalPlayTimeS?: number;
  lastPlayed?: string | null;
  lastPlayedAt?: string | null;
  playCount?: number;
  genres: string[] | string;
  customCover?: string | null;
  customHero?: string | null;
  potentialExeNames?: string | null;
  criticScore?: number | null;
  criticScoreCount?: number | null;
  communityScore?: number | null;
  communityScoreCount?: number | null;
  trailerUrl?: string | null;
  hltbMainH?: number | null;
  hltbMainExtraH?: number | null;
  hltbCompletionistH?: number | null;
  hltbId?: string | null;
  hltbFetchedAt?: string | null;
  progress?: number | null;
  milestonesJson?: string | null;
}

export interface Milestone {
  id: string;
  label: string;
  completed: boolean;
  completedAt: string | null;
}

export interface ActiveSession {
  sessionId: string;
  gameId: string;
  gameName: string;
  coverUrl: string | null;
  heroUrl: string | null;
  startedAt: string;
  dominantColor: string;
  pid: number | null;
  exeName: string | null;
  folderPath: string | null;
  potentialExeNames: string[] | null;
  processDetected: boolean;
  hasDbSession: boolean;
}

export interface GameState {
  games: Game[];
  activeSession: ActiveSession | null;
  showProcessPicker: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface GameActions {
  setGames: (games: Game[]) => void;
  setActiveSession: (session: ActiveSession | null) => void;
  setShowProcessPicker: (show: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export type GameStore = GameState & GameActions;

const initialState: GameState = {
  games: [],
  activeSession: null,
  showProcessPicker: false,
  isLoading: false,
  error: null,
};

export const useGameStore = create<GameStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setGames: (rawGames) => {
        const backend = rawGames as unknown as (BackendGame & { isHidden?: boolean })[];
        const mapped = backend.map((g) => ({
          ...g,
          genres: Array.isArray(g.genres)
            ? g.genres
            : typeof g.genres === "string" && g.genres
              ? g.genres.split(",").map((s: string) => s.trim())
              : [],
          customCover: g.customCover ?? null,
          customHero: g.customHero ?? null,
          potentialExeNames: g.potentialExeNames ?? null,
          coverUrl: normalizeImageUrl(g.customCover ?? g.coverUrl),
          heroUrl: normalizeImageUrl(g.customHero ?? g.heroUrl),
          logoUrl: normalizeImageUrl(g.logoUrl),
          iconUrl: normalizeImageUrl(g.iconUrl),
          totalPlayTimeS: g.totalPlayTime ?? g.totalPlayTimeS ?? 0,
          lastPlayedAt: g.lastPlayed ?? g.lastPlayedAt ?? null,
          playCount: g.playCount ?? 0,
          rating: g.rating ?? null,
          criticScore: g.criticScore ?? null,
          criticScoreCount: g.criticScoreCount ?? null,
          communityScore: g.communityScore ?? null,
          communityScoreCount: g.communityScoreCount ?? null,
          trailerUrl: g.trailerUrl ?? null,
          isHidden: g.isHidden ?? false,
          hltbMainH: g.hltbMainH ?? null,
          hltbMainExtraH: g.hltbMainExtraH ?? null,
          hltbCompletionistH: g.hltbCompletionistH ?? null,
          hltbId: g.hltbId ?? null,
          hltbFetchedAt: g.hltbFetchedAt ?? null,
          notes: g.notes ?? null,
          progress: g.progress ?? null,
          milestonesJson: g.milestonesJson ?? null,
        } as Game));
        set({ games: mapped }, false, "setGames");
        useSettingsStore.getState().setHiddenGameIds(mapped.filter((g) => g.isHidden).map((g) => g.id));
      },
      setActiveSession: (session) =>
        set({ activeSession: session }, false, "setActiveSession"),
      setShowProcessPicker: (show) =>
        set({ showProcessPicker: show }, false, "setShowProcessPicker"),
      setLoading: (loading) => set({ isLoading: loading }, false, "setLoading"),
      setError: (error) => set({ error }, false, "setError"),
    }),
    { name: "GameStore", enabled: import.meta.env.DEV },
  ),
);

export async function refreshGames(): Promise<void> {
  try {
    const games = await invoke<Game[]>("get_games", { params: {} });
    useGameStore.getState().setGames(games);
  } catch {
    // best-effort refresh
  }
  const { refreshCollections } = await import("@/stores/collectionStore");
  refreshCollections().catch(() => {});
}
