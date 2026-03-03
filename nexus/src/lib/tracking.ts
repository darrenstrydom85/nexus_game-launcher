import { invoke } from "@tauri-apps/api/core";

export type TrackingStrategy = "A" | "B" | "C";

export type TrackingStatus =
  | "monitoring"
  | "polling"
  | "manual"
  | "completed"
  | "failed";

export interface TrackingState {
  sessionId: string;
  gameId: string;
  strategy: TrackingStrategy;
  status: TrackingStatus;
  pid?: number;
}

export interface ProcessExitEvent {
  sessionId: string;
  gameId: string;
  pid: number;
  exitCode: number | null;
}

export interface TrackingFailedEvent {
  sessionId: string;
  gameId: string;
  reason: string;
}

// ── Strategy A: Direct Process Handle ──────────────────────────────
// When Nexus spawns the process directly (standalone, GOG direct),
// the Rust backend holds the Child handle and calls child.wait().
// Frontend just listens for the game-exited event.

export function startStrategyA(sessionId: string, gameId: string, pid: number): TrackingState {
  return {
    sessionId,
    gameId,
    strategy: "A",
    status: "monitoring",
    pid,
  };
}

export function detectParentExitedEarly(launchTime: number, exitTime: number): boolean {
  return (exitTime - launchTime) < 5000;
}

// ── Strategy B: Process List Polling ───────────────────────────────
// For protocol-launched games, the backend polls the process list.
// Frontend receives events about tracking progress.

const INITIAL_DELAY_MS = 5000;
const POLL_INTERVAL_MS = 3000;
const MONITOR_INTERVAL_MS = 5000;
const TIMEOUT_MS = 60000;

export function startStrategyB(sessionId: string, gameId: string): TrackingState {
  return {
    sessionId,
    gameId,
    strategy: "B",
    status: "polling",
  };
}

export async function requestProcessPolling(
  sessionId: string,
  gameId: string,
  exeName: string,
): Promise<void> {
  await invoke("start_process_polling", { sessionId, gameId, exeName });
}

export function getPollingConfig() {
  return {
    initialDelayMs: INITIAL_DELAY_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
    monitorIntervalMs: MONITOR_INTERVAL_MS,
    timeoutMs: TIMEOUT_MS,
  };
}

const LAUNCHER_PROCESSES = new Set([
  "steam.exe",
  "steamwebhelper.exe",
  "epicgameslauncher.exe",
  "eosoverlay.exe",
  "galaxyclient.exe",
  "galaxyclienthelper.exe",
  "ubisoftconnect.exe",
  "ubisoftgamelauncher.exe",
  "battle.net.exe",
  "agent.exe",
  "xboxapp.exe",
  "gamingservices.exe",
]);

export function isLauncherProcess(exeName: string): boolean {
  return LAUNCHER_PROCESSES.has(exeName.toLowerCase());
}

// ── Strategy C: Manual Fallback ────────────────────────────────────

export function startStrategyC(sessionId: string, gameId: string): TrackingState {
  return {
    sessionId,
    gameId,
    strategy: "C",
    status: "manual",
  };
}

export async function stopTracking(sessionId: string): Promise<void> {
  await invoke("end_session", { sessionId, endedAt: new Date().toISOString() });
}

export function shouldFallbackToManual(state: TrackingState): boolean {
  return state.status === "failed";
}
