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

// ── Process Picker (Story 22.1) ───────────────────────────────────
export interface RunningProcessInfo {
  exeName: string;
  pid: number;
  windowTitle: string | null;
}

export function listRunningProcesses(
  windowedOnly?: boolean,
): Promise<RunningProcessInfo[]> {
  return invoke<RunningProcessInfo[]>("list_running_processes", {
    windowedOnly: windowedOnly ?? null,
  });
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

// ── HLTB Commands (Story 24.1) ──────────────────────────────────
export function saveHltbData(
  gameId: string,
  hltbId: string,
  mainH: number | null,
  mainExtraH: number | null,
  completionistH: number | null,
): Promise<void> {
  return invoke<void>("save_hltb_data", {
    gameId,
    hltbId,
    mainH,
    mainExtraH,
    completionistH,
  });
}

export function clearHltbData(gameId: string): Promise<void> {
  return invoke<void>("clear_hltb_data", { gameId });
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

/** Validate current token with Twitch (GET /oauth2/validate). Refreshes if invalid. */
export function validateTwitchToken(): Promise<TwitchAuthStatus> {
  return invoke<TwitchAuthStatus>("validate_twitch_token");
}

/** Clear Twitch cached data only (no disconnect). Story 19.10. */
export function clearTwitchCache(): Promise<void> {
  return invoke<void>("clear_twitch_cache");
}

/** Check if Twitch API is reachable. Result cached 30s. Story 19.11. */
export function checkConnectivity(): Promise<{ online: boolean }> {
  return invoke<{ online: boolean }>("check_connectivity");
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

// ── Twitch Favorites (Story 19.7) ─────────────────────────────────────────
export function setTwitchFavorite(
  channelId: string,
  isFavorite: boolean,
): Promise<void> {
  return invoke<void>("set_twitch_favorite", { channelId, isFavorite });
}

// ── Twitch Trending in Library (Story 19.9) ─────────────────────────────────
export interface TrendingLibraryGame {
  gameId: string;
  gameName: string;
  twitchGameName: string;
  twitchViewerCount: number;
  twitchStreamCount: number;
  twitchRank: number;
}

export function getTwitchTrendingLibraryGames(): Promise<
  TwitchResponse<TrendingLibraryGame[]>
> {
  return invoke<TwitchResponse<TrendingLibraryGame[]>>(
    "get_twitch_trending_library_games",
  );
}

// ── Version / Update Check (JSONBin) ─────────────────────────────────────
export interface UpdateCheckResult {
  updateAvailable: boolean;
  latestVersion: string | null;
  downloadUrl: string;
}

export function checkUpdateAvailable(): Promise<UpdateCheckResult> {
  return invoke<UpdateCheckResult>("check_update_available");
}

// ── Known Issues (Story 21.1) ─────────────────────────────────────────
export interface KnownIssuesResult {
  issues: string[];
}

export function fetchKnownIssues(): Promise<KnownIssuesResult> {
  return invoke<KnownIssuesResult>("fetch_known_issues");
}

// ── Session Notes (Story 27.1) ────────────────────────────────────────
export function updateSessionNote(
  sessionId: string,
  note: string | null,
): Promise<void> {
  return invoke<void>("update_session_note", { sessionId, note });
}

// ── Session Analytics (Story 17.1) ────────────────────────────────────
export type {
  SessionScope,
  SessionDistribution,
  DistributionBucket,
  SessionRecord,
  PerGameSessionStats,
} from "../types/analytics";

export function getSessionDistribution(
  scope: import("../types/analytics").SessionScope,
): Promise<import("../types/analytics").SessionDistribution> {
  return invoke("get_session_distribution", { scope });
}

export function getPerGameSessionStats(
  gameId: string,
  limit?: number,
): Promise<import("../types/analytics").PerGameSessionStats> {
  return invoke("get_per_game_session_stats", {
    gameId,
    limit: limit ?? null,
  });
}

// ── Wrapped Report (Story 16.1) ─────────────────────────────────────
export type {
  WrappedPeriod,
  WrappedReport,
  WrappedGame,
  WrappedSession,
  GenreShare,
  PlatformShare,
  FunFact,
  Comparison,
  MonthBucket,
  DayBucket,
  HourBucket,
  HiddenGem,
  AvailableWrappedPeriods,
} from "../types/wrapped";

export function getWrappedReport(
  period: import("../types/wrapped").WrappedPeriod,
): Promise<import("../types/wrapped").WrappedReport> {
  return invoke("get_wrapped_report", { period });
}

export function getAvailableWrappedPeriods(): Promise<
  import("../types/wrapped").AvailableWrappedPeriods
> {
  return invoke("get_available_wrapped_periods");
}

// ── Play Queue (Story 28.1) ──────────────────────────────────────────
export interface PlayQueueEntry {
  id: string;
  gameId: string;
  position: number;
  addedAt: string;
  name: string;
  coverUrl: string | null;
  customCover: string | null;
  status: string;
  source: string;
}

export function getPlayQueue(): Promise<PlayQueueEntry[]> {
  return invoke<PlayQueueEntry[]>("get_play_queue");
}

export function addToPlayQueue(gameId: string): Promise<PlayQueueEntry> {
  return invoke<PlayQueueEntry>("add_to_play_queue", { gameId });
}

export function removeFromPlayQueue(gameId: string): Promise<void> {
  return invoke<void>("remove_from_play_queue", { gameId });
}

export function reorderPlayQueue(gameIds: string[]): Promise<void> {
  return invoke<void>("reorder_play_queue", { gameIds });
}

export function clearPlayQueue(): Promise<void> {
  return invoke<void>("clear_play_queue");
}

// ── Game Tags (Story 29.1) ────────────────────────────────────────────
export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

export interface TagWithCount extends Tag {
  gameCount: number;
}

export function getTags(): Promise<TagWithCount[]> {
  return invoke<TagWithCount[]>("get_tags");
}

export function createTag(
  name: string,
  color?: string | null,
): Promise<Tag> {
  return invoke<Tag>("create_tag", { name, color: color ?? null });
}

export function deleteTag(tagId: string): Promise<void> {
  return invoke<void>("delete_tag", { tagId });
}

export function renameTag(tagId: string, name: string): Promise<Tag> {
  return invoke<Tag>("rename_tag", { tagId, name });
}

export function updateTagColor(
  tagId: string,
  color: string | null,
): Promise<Tag> {
  return invoke<Tag>("update_tag_color", { tagId, color });
}

export function addTagToGame(gameId: string, tagId: string): Promise<void> {
  return invoke<void>("add_tag_to_game", { gameId, tagId });
}

export function removeTagFromGame(
  gameId: string,
  tagId: string,
): Promise<void> {
  return invoke<void>("remove_tag_from_game", { gameId, tagId });
}

export function getGameTags(gameId: string): Promise<Tag[]> {
  return invoke<Tag[]>("get_game_tags", { gameId });
}

export function getGamesByTag(tagId: string): Promise<string[]> {
  return invoke<string[]>("get_games_by_tag", { tagId });
}

export function getAllGameTagIds(): Promise<[string, string][]> {
  return invoke<[string, string][]>("get_all_game_tag_ids");
}

// ── Hardware Detection (Story 35.1) ────────────────────────────────────
export interface HardwareInfo {
  cpuBrand: "intel" | "amd" | "unknown";
  cpuName: string;
  gpuBrand: "nvidia" | "amd" | "intel" | "unknown";
  gpuName: string;
}

export function getSystemHardware(): Promise<HardwareInfo> {
  return invoke<HardwareInfo>("get_system_hardware");
}

// ── Smart Collections (Story 30.1) ────────────────────────────────────

export type SmartRuleField =
  | "status"
  | "source"
  | "genre"
  | "tag"
  | "rating"
  | "totalPlayTime"
  | "playCount"
  | "lastPlayed"
  | "addedAt"
  | "hltbMainH"
  | "criticScore"
  | "isHidden";

export type SmartRuleOperator =
  | "equals"
  | "not_equals"
  | "in"
  | "contains"
  | "not_contains"
  | "has"
  | "not_has"
  | "gt"
  | "lt"
  | "between"
  | "within_days"
  | "before_days_ago"
  | "never";

export interface SmartCollectionRule {
  field: SmartRuleField;
  op: SmartRuleOperator;
  value: unknown;
}

export interface SmartCollectionRuleGroup {
  operator: "and" | "or";
  conditions: (SmartCollectionRule | SmartCollectionRuleGroup)[];
}

export function evaluateSmartCollection(
  rulesJson: string,
): Promise<string[]> {
  return invoke<string[]>("evaluate_smart_collection", { rulesJson });
}

export function createSmartCollection(
  name: string,
  rulesJson: string,
  icon?: string | null,
  color?: string | null,
): Promise<unknown> {
  return invoke("create_collection", {
    name,
    icon: icon ?? null,
    color: color ?? null,
    isSmart: true,
    rulesJson,
  });
}

// ── Google Drive Backup ───────────────────────────────────────────────

export interface GDriveAuthStatus {
  authenticated: boolean;
  email: string | null;
  expiresAt: number | null;
}

export interface BackupEntry {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  schemaVersion: number;
}

export interface BackupResult {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  prunedCount: number;
}

export interface BackupStatus {
  connected: boolean;
  email: string | null;
  lastBackupAt: string | null;
  frequency: "manual" | "daily" | "weekly";
  retentionCount: number;
}

export function gdriveAuthStart(): Promise<GDriveAuthStatus> {
  return invoke<GDriveAuthStatus>("gdrive_auth_start");
}

export function gdriveAuthStatus(): Promise<GDriveAuthStatus> {
  return invoke<GDriveAuthStatus>("gdrive_auth_status");
}

export function gdriveAuthLogout(): Promise<void> {
  return invoke<void>("gdrive_auth_logout");
}

export function runBackup(): Promise<BackupResult> {
  return invoke<BackupResult>("run_backup");
}

export function listBackups(): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("list_backups");
}

export function restoreBackup(backupId: string): Promise<void> {
  return invoke<void>("restore_backup", { backupId });
}

export function getBackupStatus(): Promise<BackupStatus> {
  return invoke<BackupStatus>("get_backup_status");
}

export function setBackupFrequency(frequency: string): Promise<void> {
  return invoke<void>("set_backup_frequency", { frequency });
}

export function setBackupRetention(count: number): Promise<void> {
  return invoke<void>("set_backup_retention", { count });
}

// ── Streak ─────────────────────────────────────────────────────────

export interface StreakSnapshot {
  id: string;
  currentStreak: number;
  longestStreak: number;
  lastPlayDate: string | null;
  streakStartedAt: string | null;
  updatedAt: string;
}

export function getStreak(): Promise<StreakSnapshot> {
  return invoke<StreakSnapshot>("get_streak");
}

export function recalculateStreak(): Promise<StreakSnapshot> {
  return invoke<StreakSnapshot>("recalculate_streak");
}

// ── Session Milestones ────────────────────────────────────────────

export interface SessionMilestone {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: string;
  gameName: string;
}

export function checkSessionMilestones(
  sessionId: string,
): Promise<SessionMilestone[]> {
  return invoke<SessionMilestone[]>("check_session_milestones", { sessionId });
}

export function evaluateMilestonesBatch(
  sessionIds: string[],
): Promise<[string, SessionMilestone[]][]> {
  return invoke<[string, SessionMilestone[]][]>("evaluate_milestones_batch", {
    sessionIds,
  });
}
