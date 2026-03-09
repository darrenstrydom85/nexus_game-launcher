import { fetch } from "@tauri-apps/plugin-http";

const BASE_URL = "https://howlongtobeat.com/";
const FALLBACK_SEARCH_PATH = "api/finder";

export interface HltbSearchResult {
  id: number;
  name: string;
  gameplayMain: number;
  gameplayMainExtra: number;
  gameplayCompletionist: number;
  similarity: number;
}

interface HltbApiGame {
  game_id: number;
  game_name: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
  similarity: number;
}

let cachedSearchPath: string | null = null;

const API_PATTERN =
  /fetch\s*\(\s*["']\/api\/([a-zA-Z0-9_/]+)[^"']*["']\s*,\s*\{[^}]*method:\s*["']POST["'][^}]*\}/s;

async function discoverSearchPath(): Promise<string> {
  if (cachedSearchPath) return cachedSearchPath;

  try {
    const homeResp = await fetch(BASE_URL, {
      method: "GET",
      headers: { Referer: BASE_URL },
    });

    if (!homeResp.ok) {
      console.warn("[HLTB] homepage fetch failed:", homeResp.status);
      return FALLBACK_SEARCH_PATH;
    }

    const html = await homeResp.text();

    const scriptUrls: string[] = [];
    const scriptRegex = /src="(\/_next\/static\/[^"]+\.js)"/g;
    let m: RegExpExecArray | null;
    while ((m = scriptRegex.exec(html)) !== null) {
      scriptUrls.push(m[1]);
    }

    console.log("[HLTB] found", scriptUrls.length, "Next.js scripts to scan");

    for (const rawUrl of scriptUrls) {
      const scriptUrl = rawUrl.startsWith("http")
        ? rawUrl
        : BASE_URL + rawUrl.replace(/^\//, "");

      try {
        const scriptResp = await fetch(scriptUrl, {
          method: "GET",
          headers: { Referer: BASE_URL },
        });

        if (!scriptResp.ok) continue;

        const js = await scriptResp.text();
        const apiMatch = API_PATTERN.exec(js);

        if (apiMatch) {
          const pathSuffix = apiMatch[1].split("/")[0];
          cachedSearchPath = `api/${pathSuffix}`;
          console.log("[HLTB] discovered search path:", cachedSearchPath, "from", rawUrl);
          return cachedSearchPath;
        }
      } catch {
        continue;
      }
    }

    console.warn("[HLTB] POST fetch pattern not found in any script, using fallback");
  } catch (err) {
    console.error("[HLTB] discoverSearchPath error:", err);
  }

  return FALLBACK_SEARCH_PATH;
}

async function getAuthToken(searchPath: string): Promise<string | null> {
  try {
    const t = Date.now();
    const url = `${BASE_URL}${searchPath}/init?t=${t}`;
    console.log("[HLTB] fetching auth token from:", url);
    const resp = await fetch(url, {
      method: "GET",
      headers: { Referer: BASE_URL },
    });

    if (!resp.ok) {
      console.warn("[HLTB] auth token fetch failed:", resp.status);
      return null;
    }

    const json = (await resp.json()) as { token?: string };
    console.log("[HLTB] auth token:", json.token ? `${json.token.slice(0, 16)}...` : "null");
    return json.token ?? null;
  } catch (err) {
    console.error("[HLTB] getAuthToken error:", err);
    return null;
  }
}

function secondsToHours(seconds: number): number {
  return seconds > 0 ? Math.round((seconds / 3600) * 10) / 10 : 0;
}

/**
 * Search HLTB via their API. Discovers the current endpoint dynamically
 * and obtains an auth token before searching.
 */
export async function searchHltb(
  query: string,
  signal?: AbortSignal,
): Promise<HltbSearchResult[]> {
  const searchPath = await discoverSearchPath();
  if (signal?.aborted) return [];
  const authToken = await getAuthToken(searchPath);
  if (signal?.aborted) return [];

  const payload = {
    searchType: "games",
    searchTerms: query.split(" "),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: 0, max: 0 },
        gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
        rangeYear: { min: "", max: "" },
        modifier: "",
      },
      users: { sortCategory: "postcount" },
      lists: { sortCategory: "follows" },
      filter: "",
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "*/*",
    Origin: BASE_URL,
    Referer: BASE_URL,
  };

  if (authToken) {
    headers["x-auth-token"] = authToken;
  }

  const searchUrl = `${BASE_URL}${searchPath}`;
  console.log("[HLTB] POST", searchUrl, "query:", query, "hasToken:", !!authToken);

  const response = await fetch(searchUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[HLTB] search failed:", response.status, body.slice(0, 200));
    throw new Error(`HLTB search failed: ${response.status}`);
  }

  const json = await response.json();
  console.log("[HLTB] response keys:", Object.keys(json as object), "data length:", Array.isArray((json as { data?: unknown[] }).data) ? (json as { data: unknown[] }).data.length : "N/A");

  const data = (json as { data?: HltbApiGame[] }).data;
  if (!data || !Array.isArray(data)) {
    console.warn("[HLTB] no data array in response:", JSON.stringify(json).slice(0, 300));
    return [];
  }

  return data.map((g) => ({
    id: g.game_id,
    name: g.game_name,
    gameplayMain: secondsToHours(g.comp_main),
    gameplayMainExtra: secondsToHours(g.comp_plus),
    gameplayCompletionist: secondsToHours(g.comp_100),
    similarity: g.similarity ?? 0,
  }));
}
