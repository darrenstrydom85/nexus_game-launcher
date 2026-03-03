import { describe, it, expect, vi } from "vitest";
import {
  classifyLaunchError,
  buildLaunchErrorInfo,
} from "@/lib/launch-errors";

describe("Story 8.6: Launch Error Handling", () => {
  describe("classifyLaunchError", () => {
    it("classifies 'not found' as exe_not_found", () => {
      expect(classifyLaunchError("File not found")).toBe("exe_not_found");
      expect(classifyLaunchError("No such file or directory")).toBe("exe_not_found");
      expect(classifyLaunchError("Cannot find the path")).toBe("exe_not_found");
    });

    it("classifies protocol errors", () => {
      expect(classifyLaunchError("Protocol handler not registered")).toBe("protocol_not_registered");
      expect(classifyLaunchError("No application to handle")).toBe("protocol_not_registered");
    });

    it("classifies permission errors", () => {
      expect(classifyLaunchError("Permission denied")).toBe("permission_denied");
      expect(classifyLaunchError("Access denied")).toBe("permission_denied");
    });

    it("classifies spawn errors", () => {
      expect(classifyLaunchError("Failed to execute process")).toBe("spawn_failed");
      expect(classifyLaunchError("Spawn error: os error 2")).toBe("spawn_failed");
    });

    it("classifies unknown errors", () => {
      expect(classifyLaunchError("Something unexpected")).toBe("unknown");
    });
  });

  describe("buildLaunchErrorInfo", () => {
    it("exe_not_found: message + Set Path action", () => {
      const onSetExe = vi.fn();
      const info = buildLaunchErrorInfo("File not found", "Cyberpunk", { onSetExe });
      expect(info.kind).toBe("exe_not_found");
      expect(info.message).toContain("Executable not found");
      expect(info.message).toContain("Cyberpunk");
      expect(info.toastType).toBe("error");
      expect(info.action?.label).toBe("Set Path");
    });

    it("exe_not_found: fallback to Re-scan action", () => {
      const onRescan = vi.fn();
      const info = buildLaunchErrorInfo("File not found", "Game", { onRescan });
      expect(info.action?.label).toBe("Re-scan");
    });

    it("protocol_not_registered: message + Set Exe Path action", () => {
      const onSwitchDirect = vi.fn();
      const info = buildLaunchErrorInfo("Protocol not registered", "Game", { onSwitchDirect });
      expect(info.kind).toBe("protocol_not_registered");
      expect(info.message).toContain("Protocol handler");
      expect(info.action?.label).toBe("Set Exe Path");
    });

    it("permission_denied: message with admin suggestion", () => {
      const info = buildLaunchErrorInfo("Permission denied", "Game");
      expect(info.kind).toBe("permission_denied");
      expect(info.message).toContain("administrator");
      expect(info.action).toBeUndefined();
    });

    it("spawn_failed: message + Try Again action", () => {
      const onTryAgain = vi.fn();
      const info = buildLaunchErrorInfo("Failed to execute process", "Game", { onTryAgain });
      expect(info.kind).toBe("spawn_failed");
      expect(info.action?.label).toBe("Try Again");
    });

    it("all errors are toast type 'error'", () => {
      expect(buildLaunchErrorInfo("not found", "G").toastType).toBe("error");
      expect(buildLaunchErrorInfo("permission", "G").toastType).toBe("error");
      expect(buildLaunchErrorInfo("spawn", "G").toastType).toBe("error");
      expect(buildLaunchErrorInfo("unknown thing", "G").toastType).toBe("error");
    });
  });
});
