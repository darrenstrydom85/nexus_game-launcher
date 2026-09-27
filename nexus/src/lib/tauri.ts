import { invoke } from "@tauri-apps/api/core";

// ── Scanner Commands ───────────────────────────────────────────────
export interface ScanResult {
  path: string;
  name: string;
  executable: string;
}

// ── Launcher Commands ──────────────────────────────────────────────
export interface LaunchResult {
  pid: number;
  gameId: string;
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

// ── Metadata Commands ──────────────────────────────────────────────
export interface GameMetadata {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  genres?: string[];
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

export interface CacheStats {
  totalBytes: number;
  gameBytes?: number;
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

// ── Database Commands ──────────────────────────────────────────────
export interface DbStatus {
  connected: boolean;
  version: string;
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
  /** Logged-in user's Twitch avatar URL (Helix users.profile_image_url).
   *  Backfilled by validate_twitch_token for users authenticated before
   *  this field was added. */
  profileImageUrl: string | null;
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

/** Resolved theme tokens for the spawned Twitch windows (camelCase matches Rust `EmbedTheme`). */
export interface TwitchEmbedTheme {
  bg: string;
  panel: string;
  border: string;
  fg: string;
  muted: string;
  accent: string;
  danger: string;
}

/**
 * Push resolved theme colors to the backend so future Twitch pop-out / clip
 * windows mirror the selected theme. Already-open windows are not updated.
 */
export function setTwitchEmbedTheme(theme: TwitchEmbedTheme): Promise<void> {
  return invoke<void>("set_twitch_embed_theme", { theme });
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

// ── Twitch Diagnostics (Story D1) ─────────────────────────────────────────

export interface TwitchRateLimitSnapshot {
  tokensUsed: number;
  tokensRemaining: number;
  windowResetAt: number;
  windowSecs: number;
  cap: number;
}

export interface TwitchDiagnostics {
  tokenAuthenticated: boolean;
  tokenExpiresAt: number | null;
  tokenExpiresInSecs: number | null;
  lastRefreshAt: number | null;
  lastRefreshError: string | null;
  displayName: string | null;
  userId: string | null;
  rateLimit: TwitchRateLimitSnapshot;
  eventsubConnected: boolean;
  eventsubSessionId: string | null;
  eventsubSubscriptionCount: number;
  lastEventAt: number | null;
  nowSecs: number;
}

export interface TwitchTestConnectionResult {
  ok: boolean;
  latencyMs: number;
  error: string | null;
}

export function getTwitchDiagnostics(): Promise<TwitchDiagnostics> {
  return invoke<TwitchDiagnostics>("get_twitch_diagnostics");
}

export function twitchTestConnection(): Promise<TwitchTestConnectionResult> {
  return invoke<TwitchTestConnectionResult>("twitch_test_connection");
}

// ── Twitch Top Clips per Library Game (Story A2) ─────────────────────────

export interface TwitchClip {
  id: string;
  url: string;
  embedUrl: string;
  broadcasterId: string;
  broadcasterName: string;
  creatorName: string | null;
  title: string;
  viewCount: number;
  durationSecs: number;
  thumbnailUrl: string;
  createdAt: string;
}

export interface GameClipsResponse {
  clips: TwitchClip[];
  twitchGameId: string;
  twitchGameName: string;
  stale: boolean;
  cachedAt: number | null;
}

export function getTwitchClipsForGame(
  gameName: string,
): Promise<GameClipsResponse> {
  return invoke<GameClipsResponse>("get_twitch_clips_for_game", { gameName });
}

// ── Twitch Watch History (Story E1) ─────────────────────────────────────────

export interface WatchTotals {
  totalSecs: number;
  sessionCount: number;
}
export interface WatchByChannel {
  channelLogin: string;
  channelDisplayName: string | null;
  totalSecs: number;
  sessionCount: number;
}
export interface WatchByGame {
  twitchGameId: string | null;
  twitchGameName: string | null;
  nexusGameId: string | null;
  totalSecs: number;
  sessionCount: number;
}
export interface WatchAggregate {
  totals: WatchTotals;
  topChannels: WatchByChannel[];
  topGames: WatchByGame[];
}

/**
 * Aggregate Twitch watch history for an arbitrary inclusive date range
 * (`YYYY-MM-DD` strings, UTC). Powers the date-range-aware Stats tile and
 * Wrapped slide so they follow the same selector as the rest of the report.
 */
export function getTwitchWatchForRange(
  startDate: string,
  endDate: string,
  topN = 3,
): Promise<WatchAggregate> {
  return invoke<WatchAggregate>("get_twitch_watch_for_range", {
    startDate,
    endDate,
    topN,
  });
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

// ── Mastery Tiers ─────────────────────────────────────────────────

export type MasteryTierValue =
  | "none"
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond";

export interface GameMasteryTier {
  gameId: string;
  tier: MasteryTierValue;
  totalPlayTimeS: number;
  nextTierThresholdS: number | null;
  progressToNextTier: number;
}

export function getMasteryTier(gameId: string): Promise<GameMasteryTier> {
  return invoke<GameMasteryTier>("get_mastery_tier", { gameId });
}

export function getMasteryTiersBulk(): Promise<GameMasteryTier[]> {
  return invoke<GameMasteryTier[]>("get_mastery_tiers_bulk");
}

// ── Retirement Ceremony (Epic 41) ─────────────────────────────────

export interface MonthPlayTime {
  month: string;
  playTimeS: number;
}

export interface GameCeremonyData {
  gameId: string;
  gameName: string;
  coverArtUrl: string | null;
  heroArtUrl: string | null;
  /** Raw `games.status`: "completed" | "dropped" | "playing" | "backlog" | "wishlist" | "removed". */
  status: string;
  /**
   * `games.completed` flag — survives status changes. Use this (not
   * `status === "completed"`) as the canonical completion signal so archived/
   * uninstalled games (status = "removed") still render correctly.
   */
  completed: boolean;
  rating: number | null;
  totalPlayTimeS: number;
  totalSessions: number;
  longestSessionS: number;
  averageSessionS: number;
  firstPlayedAt: string;
  lastPlayedAt: string;
  daysBetweenFirstAndLast: number;
  playTimeByMonth: MonthPlayTime[];
  /** 7 entries, Monday=0 through Sunday=6. */
  playTimeByDayOfWeek: number[];
  /** 24 entries, hour 0 through hour 23. */
  playTimeByHourOfDay: number[];
  funFacts: string[];
  masteryTier: MasteryTierValue;
  genres: string | null;
  releaseYear: string | null;
}

export function getGameCeremonyData(gameId: string): Promise<GameCeremonyData> {
  return invoke<GameCeremonyData>("get_game_ceremony_data", { gameId });
}

// ── Achievements ──────────────────────────────────────────────────

export type AchievementCategory =
  | "library"
  | "play"
  | "completion"
  | "streak"
  | "exploration"
  | "session";

export type AchievementRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "epic"
  | "legendary";

export interface AchievementStatus {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  points: number;
  unlocked: boolean;
  unlockedAt: string | null;
  contextJson: string | null;
}

export function getAchievementStatus(): Promise<AchievementStatus[]> {
  return invoke<AchievementStatus[]>("get_achievement_status");
}

export interface NewlyUnlocked {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  rarity: AchievementRarity;
  points: number;
  unlockedAt: string;
  contextJson: string | null;
}

export function evaluateAchievements(): Promise<NewlyUnlocked[]> {
  return invoke<NewlyUnlocked[]>("evaluate_achievements");
}

// ── XP & Level System ─────────────────────────────────────────────

export interface XpEvent {
  id: string;
  source: string;
  sourceId: string | null;
  xpAmount: number;
  description: string;
  createdAt: string;
}

export interface XpSummary {
  totalXp: number;
  currentLevel: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressToNextLevel: number;
  leveledUp: boolean;
  newLevel: number | null;
}

export interface XpBreakdownRow {
  sourceType: string;
  totalXp: number;
  eventCount: number;
}

export function getXpSummary(): Promise<XpSummary> {
  return invoke<XpSummary>("get_xp_summary");
}

export function getXpHistory(limit?: number): Promise<XpEvent[]> {
  return invoke<XpEvent[]>("get_xp_history", { limit: limit ?? null });
}

export function getXpBreakdown(): Promise<XpBreakdownRow[]> {
  return invoke<XpBreakdownRow[]>("get_xp_breakdown");
}

export function awardXp(
  source: string,
  sourceId: string | null,
  xpAmount: number,
  description: string
): Promise<XpSummary> {
  return invoke<XpSummary>("award_xp", {
    source,
    sourceId,
    xpAmount,
    description,
  });
}
