import { invoke } from "@tauri-apps/api/core";

// ── Shared Error Type ──────────────────────────────────────────────
export type CommandErrorKind =
  | "io"
  | "database"
  | "notFound"
  | "parse"
  | "permission"
  | "networkUnavailable"
  | "auth"
  | "unknown";

export interface CommandError {
  kind: CommandErrorKind;
  message: string;
}

// ── Ping / Health Check ────────────────────────────────────────────
export interface PingResponse {
  message: string;
  timestamp: number;
}

export function ping(): Promise<PingResponse> {
  return invoke<PingResponse>("ping");
}

// ── Scanner Commands ───────────────────────────────────────────────
export interface ScanResult {
  path: string;
  name: string;
  executable: string;
}

export function scanDirectory(_path: string): Promise<ScanResult[]> {
  return invoke<ScanResult[]>("scan_directory", { path: _path });
}

// ── Launcher Commands ──────────────────────────────────────────────
export interface LaunchOptions {
  gameId: string;
  args?: string[];
}

export interface LaunchResult {
  pid: number;
  gameId: string;
}

export function launchGame(options: LaunchOptions): Promise<LaunchResult> {
  return invoke<LaunchResult>("launch_game", { options });
}

export function stopGame(pid: number): Promise<void> {
  return invoke<void>("stop_game", { pid });
}

// ── Playtime Commands ──────────────────────────────────────────────
export interface PlaytimeRecord {
  gameId: string;
  totalSeconds: number;
  lastPlayed: string;
}

export function getPlaytime(gameId: string): Promise<PlaytimeRecord> {
  return invoke<PlaytimeRecord>("get_playtime", { gameId });
}

// ── Metadata Commands ──────────────────────────────────────────────
export interface GameMetadata {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  genres?: string[];
}

export function getMetadata(gameId: string): Promise<GameMetadata> {
  return invoke<GameMetadata>("get_metadata", { gameId });
}

export interface VerifyKeyResult {
  valid: boolean;
  message: string;
}

export function verifySteamgridKey(): Promise<VerifyKeyResult> {
  return invoke<VerifyKeyResult>("verify_steamgrid_key");
}

export function verifyIgdbKeys(): Promise<VerifyKeyResult> {
  return invoke<VerifyKeyResult>("verify_igdb_keys");
}

export function fetchMetadata(gameId: string): Promise<void> {
  return invoke<void>("fetch_metadata", { gameId });
}

export interface MetadataSearchResult {
  id: number;
  name: string;
  releaseDate: number | null;
  coverUrl: string | null;
}

export function searchMetadata(query: string): Promise<MetadataSearchResult[]> {
  return invoke<MetadataSearchResult[]>("search_metadata", { query });
}

export function fetchMetadataWithIgdbId(
  gameId: string,
  igdbId: number,
  skipSteamgrid?: boolean,
): Promise<void> {
  return invoke<void>("fetch_metadata_with_igdb_id", {
    gameId,
    igdbId,
    skipSteamgrid: skipSteamgrid ?? null,
  });
}

export interface SteamGridSearchResult {
  id: number;
  name: string;
  verified: boolean;
  coverUrl?: string | null;
}

export function searchSteamgridArtwork(
  query: string,
): Promise<SteamGridSearchResult[]> {
  return invoke<SteamGridSearchResult[]>("search_steamgrid_artwork", {
    query,
  });
}

export function applySteamgridArtwork(
  gameId: string,
  steamgridId: number,
): Promise<void> {
  return invoke<void>("apply_steamgrid_artwork", {
    gameId,
    steamgridId,
  });
}

export function fetchArtwork(gameId: string): Promise<void> {
  return invoke<void>("fetch_artwork", { gameId });
}

export interface KeyStatus {
  steamgrid: boolean;
  igdb: boolean;
  availability: "both" | "steamgrid_only" | "igdb_only" | "neither";
}

export function getKeyStatus(): Promise<KeyStatus> {
  return invoke<KeyStatus>("get_key_status");
}

export interface CacheStats {
  totalBytes: number;
  gameBytes?: number;
}

export function getCacheStats(gameId?: string): Promise<CacheStats> {
  return invoke<CacheStats>("get_cache_stats", { gameId: gameId ?? null });
}

export function getPlaceholderCover(name: string): Promise<string> {
  return invoke<string>("get_placeholder_cover", { name });
}

export function runScoreBackfill(): Promise<number> {
  return invoke<number>("run_score_backfill");
}

// ── Score Backfill Progress Event ─────────────────────────────────
export interface ScoreBackfillProgressEvent {
  completed: number;
  total: number;
}

// ── Metadata Progress Event ───────────────────────────────────────
export type MetadataStatus = "queued" | "fetching" | "complete" | "failed";

export type MetadataProgressTrigger = "onboarding" | "resync" | "auto";

export interface MetadataSyncError {
  source: string;
  gameId: string;
  message: string;
}

export interface MetadataProgressEvent {
  phase: string;
  completed: number;
  total: number;
  currentGame: string | null;
  trigger: MetadataProgressTrigger;
  error: MetadataSyncError | null;
  gameId: string;
  gameName: string;
  status: MetadataStatus;
  progress?: number;
}

// ── Event Commands ─────────────────────────────────────────────────
export function emitTestEvent(message: string): Promise<void> {
  return invoke<void>("emit_test_event", { message });
}

// ── Database Commands ──────────────────────────────────────────────
export interface DbStatus {
  connected: boolean;
  version: string;
}

export function getDbStatus(): Promise<DbStatus> {
  return invoke<DbStatus>("get_db_status");
}

// ── Deduplication Commands ────────────────────────────────────────

export type MatchMethod = "igdbId" | "exactName" | "fuzzyName";

export type DuplicateResolution =
  | "unresolved"
  | "prefer_source"
  | "keep_both"
  | "hide_one";

export interface DuplicateCandidate {
  gameAId: string;
  gameAName: string;
  gameASource: string;
  gameBId: string;
  gameBName: string;
  gameBSource: string;
  matchMethod: MatchMethod;
  confidence: number;
}

export interface DuplicateMember {
  gameId: string;
  gameName: string;
  source: string;
  isPreferred: boolean;
  isHidden: boolean;
  coverUrl: string | null;
}

export interface DuplicateGroup {
  id: string;
  primaryGameId: string;
  resolution: string;
  members: DuplicateMember[];
  createdAt: string;
  updatedAt: string;
}

export function findDuplicates(): Promise<DuplicateCandidate[]> {
  return invoke<DuplicateCandidate[]>("find_duplicates");
}

export interface ResolveDuplicateParams {
  gameIds: string[];
  preferredGameId: string;
  resolution: DuplicateResolution;
}

export function resolveDuplicateGroup(
  params: ResolveDuplicateParams,
): Promise<DuplicateGroup> {
  return invoke<DuplicateGroup>("resolve_duplicate_group", { params });
}

export interface UpdateResolutionParams {
  groupId: string;
  preferredGameId: string;
  resolution: DuplicateResolution;
}

export function updateDuplicateResolution(
  params: UpdateResolutionParams,
): Promise<DuplicateGroup> {
  return invoke<DuplicateGroup>("update_duplicate_resolution", { params });
}

export function getDuplicateGroups(): Promise<DuplicateGroup[]> {
  return invoke<DuplicateGroup[]>("get_duplicate_groups");
}

export function getGameSources(gameId: string): Promise<DuplicateMember[]> {
  return invoke<DuplicateMember[]>("get_game_sources", { gameId });
}

// ── Library Health Check ───────────────────────────────────────────

export interface DeadGame {
  id: string;
  name: string;
  source: string;
  exePath: string | null;
  folderPath: string | null;
  lastPlayed: string | null;
  totalPlayTimeS: number;
}

export interface LibraryHealthReport {
  deadGames: DeadGame[];
  totalChecked: number;
  checkedAt: string;
}

export interface HealthCheckProgressEvent {
  checked: number;
  total: number;
}

export function checkLibraryHealth(): Promise<LibraryHealthReport> {
  return invoke<LibraryHealthReport>("check_library_health");
}

// ── Twitch Auth (Story 19.1) ─────────────────────────────────────────
export interface TwitchAuthStatus {
  authenticated: boolean;
  displayName: string | null;
  expiresAt: number | null;
}

export function twitchAuthStart(): Promise<void> {
  return invoke<void>("twitch_auth_start");
}

export function twitchAuthStatus(): Promise<TwitchAuthStatus> {
  return invoke<TwitchAuthStatus>("twitch_auth_status");
}

export function twitchAuthLogout(): Promise<void> {
  return invoke<void>("twitch_auth_logout");
}

// ── Twitch Streams by Game (Story 19.5) ─────────────────────────────────
export interface TwitchStreamByGame {
  userId: string;
  login: string;
  displayName: string;
  profileImageUrl: string;
  title: string;
  gameName: string;
  gameId: string;
  viewerCount: number;
  thumbnailUrl: string;
  startedAt: string;
}

export interface StreamsByGameData {
  streams: TwitchStreamByGame[];
  twitchGameName: string;
}

export interface TwitchResponse<T> {
  data: T;
  stale: boolean;
  cachedAt: number | null;
}

export function getTwitchStreamsByGame(
  gameName: string,
): Promise<TwitchResponse<StreamsByGameData>> {
  return invoke<TwitchResponse<StreamsByGameData>>("get_twitch_streams_by_game", {
    gameName,
  });
}
