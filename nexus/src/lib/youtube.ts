/** YouTube video id from a watch URL, or null. */
export function extractYoutubeId(url: string): string | null {
  try {
    return new URL(url).searchParams.get("v");
  } catch {
    return null;
  }
}
