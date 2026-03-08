import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Resolves a cover/image URL for display.
 * Handles HTTP(S) URLs, data URIs, and local file paths (via Tauri's asset protocol).
 * Returns `null` when the input is null/empty.
 */
export function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  try {
    return convertFileSrc(url);
  } catch {
    return url;
  }
}
