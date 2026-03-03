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

  it("includes all required filesystem permissions scoped to $APPDATA/nexus", () => {
    const requiredFs = [
      "fs:allow-read-dir",
      "fs:allow-read-file",
      "fs:allow-write-file",
      "fs:allow-write-text-file",
      "fs:allow-mkdir",
      "fs:allow-remove",
      "fs:allow-rename",
      "fs:allow-exists",
    ];

    for (const perm of requiredFs) {
      expect(ids).toContain(perm);
    }

    const fsPerms = caps.permissions.filter(
      (p): p is PermissionScope =>
        typeof p !== "string" && p.identifier.startsWith("fs:"),
    );

    for (const perm of fsPerms) {
      for (const scope of perm.allow ?? []) {
        expect(scope.path).toMatch(/^\$APPDATA\/nexus/);
      }
    }
  });

  it("does not use the overly broad fs:default", () => {
    expect(ids).not.toContain("fs:default");
  });

  it("includes shell:allow-open for URL opening", () => {
    expect(ids).toContain("shell:allow-open");
  });

  it("does not use the overly broad shell:default", () => {
    expect(ids).not.toContain("shell:default");
  });

  it("includes process:default for app lifecycle", () => {
    expect(ids).toContain("process:default");
  });

  it("includes HTTP permissions scoped to required API domains", () => {
    const httpPerm = caps.permissions.find(
      (p): p is PermissionScope =>
        typeof p !== "string" && p.identifier.startsWith("http:"),
    );

    expect(httpPerm).toBeDefined();
    const urls = (httpPerm!.allow ?? []).map((s) => s.url ?? "");

    expect(urls.some((u) => u.includes("steamgriddb.com"))).toBe(true);
    expect(urls.some((u) => u.includes("api.igdb.com"))).toBe(true);
    expect(urls.some((u) => u.includes("id.twitch.tv"))).toBe(true);
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
