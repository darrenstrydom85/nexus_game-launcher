import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

interface PermissionScope {
  identifier: string;
  allow?: Array<{ path?: string; url?: string }>;
  deny?: Array<{ path?: string; url?: string }>;
}

interface Capabilities {
  identifier: string;
  description: string;
  windows: string[];
  permissions: Array<string | PermissionScope>;
}

function loadCapabilities(): Capabilities {
  const filePath = resolve(__dirname, "../../src-tauri/capabilities/default.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

function getPermissionIds(caps: Capabilities): string[] {
  return caps.permissions.map((p) =>
    typeof p === "string" ? p : p.identifier,
  );
}

describe("tauri capabilities configuration", () => {
  const caps = loadCapabilities();
  const ids = getPermissionIds(caps);

  it("targets only the main window", () => {
    expect(caps.windows).toEqual(["main"]);
  });

  it("includes core:default and core:event:default", () => {
    expect(ids).toContain("core:default");
    expect(ids).toContain("core:event:default");
  });

  it("grants only the fs commands the frontend uses (dialog-picked files)", () => {
    expect(ids.filter((id) => id.startsWith("fs:")).sort()).toEqual([
      "fs:allow-read-text-file",
      "fs:allow-write-file",
      "fs:allow-write-text-file",
    ]);
  });

  it("does not use the overly broad fs:default", () => {
    expect(ids).not.toContain("fs:default");
  });

  it("does not grant the shell plugin", () => {
    expect(ids.filter((id) => id.startsWith("shell:"))).toEqual([]);
  });

  it("grants restart only, not exit", () => {
    expect(ids).toContain("process:allow-restart");
    expect(ids).not.toContain("process:default");
  });

  it("has no generic open-path and scopes open-url", () => {
    expect(ids).not.toContain("opener:default");
    expect(ids).not.toContain("opener:allow-open-path");
  });

  it("scopes HTTP to the hosts the webview fetches", () => {
    const httpPerm = caps.permissions.find(
      (p): p is PermissionScope =>
        typeof p !== "string" && p.identifier.startsWith("http:"),
    );

    expect(httpPerm).toBeDefined();
    const urls = (httpPerm!.allow ?? []).map((s) => s.url ?? "");

    // Only webview fetches: HLTB (hltb.ts) and retro cover bytes (RetroCover).
    // Everything else goes through Rust reqwest.
    expect(urls.sort()).toEqual([
      "https://cdn2.steamgriddb.com/**",
      "https://howlongtobeat.com/**",
      "https://images.igdb.com/**",
    ]);
  });

  it("all HTTP scopes use HTTPS only", () => {
    const httpPerm = caps.permissions.find(
      (p): p is PermissionScope =>
        typeof p !== "string" && p.identifier.startsWith("http:"),
    );

    for (const scope of httpPerm?.allow ?? []) {
      expect(scope.url).toMatch(/^https:\/\//);
    }
  });

  it("HTTP scopes do not use wildcard domains", () => {
    const httpPerm = caps.permissions.find(
      (p): p is PermissionScope =>
        typeof p !== "string" && p.identifier.startsWith("http:"),
    );

    for (const scope of httpPerm?.allow ?? []) {
      const domain = scope.url!.replace("https://", "").split("/")[0];
      expect(domain).not.toContain("*");
    }
  });
});
