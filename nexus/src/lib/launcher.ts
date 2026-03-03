import { invoke } from "@tauri-apps/api/core";
import type { Game, GameSource } from "@/stores/gameStore";

export type LaunchProtocol = "direct_exe" | "steam_url" | "epic_url" | "gog_url" | "ubisoft_url" | "battlenet_url" | "xbox_shell";

export interface LaunchRequest {
  gameId: string;
  protocol: LaunchProtocol;
  target: string;
}

export interface LaunchResult {
  sessionId: string;
  gameId: string;
  status: "launched" | "already_running" | "failed";
  pid?: number;
  error?: string;
}

const PROTOCOL_URL_PREFIXES: Partial<Record<GameSource, string>> = {
  steam: "steam://rungameid/",
  epic: "com.epicgames.launcher://apps/",
  ubisoft: "uplay://launch/",
  battlenet: "battlenet://",
};

function resolveStandaloneTarget(game: Game): string {
  if (game.exePath) return game.exePath;
  if (game.folderPath && game.exeName) {
    const sep = game.folderPath.endsWith("\\") || game.folderPath.endsWith("/") ? "" : "\\";
    return `${game.folderPath}${sep}${game.exeName}`;
  }
  return "";
}

export function resolveLaunchProtocol(game: Game): LaunchRequest {
  switch (game.source) {
    case "standalone":
      return {
        gameId: game.id,
        protocol: "direct_exe",
        target: resolveStandaloneTarget(game),
      };

    case "steam":
      if (game.launchUrl) {
        return { gameId: game.id, protocol: "steam_url", target: game.launchUrl };
      }
      return {
        gameId: game.id,
        protocol: "steam_url",
        target: `${PROTOCOL_URL_PREFIXES.steam}${game.igdbId ?? ""}`,
      };

    case "epic":
      if (game.launchUrl) {
        return { gameId: game.id, protocol: "epic_url", target: game.launchUrl };
      }
      return {
        gameId: game.id,
        protocol: "epic_url",
        target: `${PROTOCOL_URL_PREFIXES.epic}${game.id}`,
      };

    case "gog":
      if (game.exePath) {
        return { gameId: game.id, protocol: "direct_exe", target: game.exePath };
      }
      return {
        gameId: game.id,
        protocol: "gog_url",
        target: game.launchUrl ?? `goggalaxy://openGameView/${game.id}`,
      };

    case "ubisoft":
      return {
        gameId: game.id,
        protocol: "ubisoft_url",
        target: game.launchUrl ?? `${PROTOCOL_URL_PREFIXES.ubisoft}${game.id}`,
      };

    case "battlenet":
      return {
        gameId: game.id,
        protocol: "battlenet_url",
        target: game.launchUrl ?? `${PROTOCOL_URL_PREFIXES.battlenet}${game.id}`,
      };

    case "xbox":
      return {
        gameId: game.id,
        protocol: "xbox_shell",
        target: game.launchUrl ?? `explorer shell:AppsFolder\\${game.id}`,
      };

    default:
      return {
        gameId: game.id,
        protocol: "direct_exe",
        target: game.exePath ?? "",
      };
  }
}

export function isProtocolLaunch(protocol: LaunchProtocol): boolean {
  return protocol !== "direct_exe";
}

export function getTrackingStrategy(protocol: LaunchProtocol): "A" | "B" {
  return protocol === "direct_exe" ? "A" : "B";
}

let activeLaunch: string | null = null;

export function isGameRunning(): boolean {
  return activeLaunch !== null;
}

export function getRunningGameId(): string | null {
  return activeLaunch;
}

export function setRunningGame(gameId: string | null): void {
  activeLaunch = gameId;
}

export async function dispatchLaunch(game: Game): Promise<LaunchResult> {
  if (activeLaunch) {
    return {
      sessionId: "",
      gameId: game.id,
      status: "already_running",
      error: `Another game is already running (${activeLaunch})`,
    };
  }

  const request = resolveLaunchProtocol(game);

  if (request.protocol === "direct_exe" && !request.target) {
    return {
      sessionId: "",
      gameId: game.id,
      status: "failed",
      error: "No executable path configured",
    };
  }

  try {
    const result = await invoke<LaunchResult>("launch_game", {
      gameId: game.id,
      protocol: request.protocol,
      target: request.target,
    });

    if (result.status === "launched") {
      activeLaunch = game.id;
    }

    return result;
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      sessionId: "",
      gameId: game.id,
      status: "failed",
      error: errMsg,
    };
  }
}
