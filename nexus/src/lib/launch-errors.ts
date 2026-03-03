import type { ToastType, ToastAction } from "@/stores/toastStore";

export type LaunchErrorKind =
  | "exe_not_found"
  | "protocol_not_registered"
  | "permission_denied"
  | "spawn_failed"
  | "unknown";

export interface LaunchErrorInfo {
  kind: LaunchErrorKind;
  message: string;
  toastType: ToastType;
  action?: ToastAction;
}

export function classifyLaunchError(error: string): LaunchErrorKind {
  const lower = error.toLowerCase();
  if (lower.includes("not found") || lower.includes("no such file") || lower.includes("cannot find")) {
    return "exe_not_found";
  }
  if (lower.includes("protocol") || lower.includes("no application") || lower.includes("not registered")) {
    return "protocol_not_registered";
  }
  if (lower.includes("permission") || lower.includes("access denied") || lower.includes("elevation")) {
    return "permission_denied";
  }
  if (lower.includes("spawn") || lower.includes("failed to execute") || lower.includes("os error")) {
    return "spawn_failed";
  }
  return "unknown";
}

export function buildLaunchErrorInfo(
  error: string,
  gameName: string,
  callbacks?: {
    onRescan?: () => void;
    onSetExe?: () => void;
    onSwitchDirect?: () => void;
    onTryAgain?: () => void;
  },
): LaunchErrorInfo {
  const kind = classifyLaunchError(error);

  switch (kind) {
    case "exe_not_found":
      return {
        kind,
        message: `Executable not found for "${gameName}". Re-scan or set the path manually.`,
        toastType: "error",
        action: callbacks?.onSetExe
          ? { label: "Set Path", onClick: callbacks.onSetExe }
          : callbacks?.onRescan
            ? { label: "Re-scan", onClick: callbacks.onRescan }
            : undefined,
      };

    case "protocol_not_registered":
      return {
        kind,
        message: `Protocol handler not registered for "${gameName}". Try launching with a direct executable.`,
        toastType: "error",
        action: callbacks?.onSwitchDirect
          ? { label: "Set Exe Path", onClick: callbacks.onSwitchDirect }
          : undefined,
      };

    case "permission_denied":
      return {
        kind,
        message: `Permission denied launching "${gameName}". Try running Nexus as administrator.`,
        toastType: "error",
      };

    case "spawn_failed":
      return {
        kind,
        message: `Failed to launch "${gameName}".`,
        toastType: "error",
        action: callbacks?.onTryAgain
          ? { label: "Try Again", onClick: callbacks.onTryAgain }
          : undefined,
      };

    default:
      return {
        kind,
        message: `Failed to launch "${gameName}": ${error}`,
        toastType: "error",
        action: callbacks?.onTryAgain
          ? { label: "Try Again", onClick: callbacks.onTryAgain }
          : undefined,
      };
  }
}
