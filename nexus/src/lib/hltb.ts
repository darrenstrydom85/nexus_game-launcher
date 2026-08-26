import { fetch } from "@tauri-apps/plugin-http";

const BASE_URL = "https://howlongtobeat.com/";
// HLTB rotates this path every few months (api/find → api/bleed → api/search/site
// between Apr and Aug 2026). When init 404s we re-discover it from the site's
// Next.js chunks, which reference it as `/api/<path>/init?t=${Date.now()}`.
let searchPath = "api/search/site";
// Discovery pulls ~600 KB of chunks; don't repeat it on every search when it finds nothing.
let lastDiscoveryAt = 0;
const DISCOVERY_COOLDOWN_MS = 10 * 60 * 1000;

export interface HltbSearchResult {
  id: number;
  name: string;
  gameplayMain: number;
  gameplayMainExtra: number;
  gameplayCompletionist: number;
}

interface HltbApiGame {
  game_id: number;
  game_name: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
}

interface AuthSession {
  token: string;
  hpKey: string;
  hpVal: string;
  expiresAt: number;
}

let cachedSession: AuthSession | null = null;
const SESSION_TTL_MS = 55 * 60 * 1000;

function invalidateSession(): void {
  cachedSession = null;
}

async function discoverSearchPath(signal?: AbortSignal): Promise<string | null> {
  const home = await fetch(BASE_URL, { method: "GET", signal });
  if (!home.ok) return null;

  const chunks = new Set(
    (await home.text()).match(/\/_next\/static\/chunks\/[^"']+\.js/g) ?? [],
  );
  for (const chunk of chunks) {
    const resp = await fetch(`${BASE_URL}${chunk.slice(1)}`, { method: "GET", signal });
    if (!resp.ok) continue;
    const m = /\/api\/([a-zA-Z0-9_/-]+)\/init\?t=/.exec(await resp.text());
    if (m) return `api/${m[1]}`;
  }
  return null;
}

function fetchInit(signal?: AbortSignal): Promise<Response> {
  const url = `${BASE_URL}${searchPath}/init?t=${Date.now()}`;
  console.log("[HLTB] fetching session from:", url);
  return fetch(url, {
    method: "GET",
    headers: {
      Referer: `${BASE_URL}`,
      Origin: BASE_URL,
    },
    signal,
  });
}

async function getSession(signal?: AbortSignal): Promise<AuthSession | null> {
  if (cachedSession && Date.now() < cachedSession.expiresAt) return cachedSession;

  try {
    let resp = await fetchInit(signal);

    if (resp.status === 404 && Date.now() - lastDiscoveryAt > DISCOVERY_COOLDOWN_MS) {
      lastDiscoveryAt = Date.now();
      const discovered = await discoverSearchPath(signal);
      if (discovered && discovered !== searchPath) {
        console.warn("[HLTB] search path moved:", searchPath, "->", discovered);
        searchPath = discovered;
        resp = await fetchInit(signal);
      }
    }

    if (!resp.ok) {
      console.warn("[HLTB] session init failed:", resp.status);
      invalidateSession();
      return null;
    }

    const json = (await resp.json()) as {
      token?: string;
      hpKey?: string;
      hpVal?: string;
    };

    if (!json.token || !json.hpKey || !json.hpVal) {
      console.warn("[HLTB] session init missing fields:", Object.keys(json));
      return null;
    }

    console.log(
      "[HLTB] session acquired — token:",
      json.token.slice(0, 16) + "...",
      "hpKey:", json.hpKey,
    );

    cachedSession = {
      token: json.token,
      hpKey: json.hpKey,
      hpVal: json.hpVal,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };

    return cachedSession;
  } catch (err) {
    console.error("[HLTB] getSession error:", err);
    invalidateSession();
    return null;
  }
}

function secondsToHours(seconds: number): number {
  return seconds > 0 ? Math.round((seconds / 3600) * 10) / 10 : 0;
}

function buildPayload(query: string, hpKey: string, hpVal: string) {
  const payload: Record<string, unknown> = {
    searchType: "games",
    searchTerms: query.trim().split(/\s+/),
    searchPage: 1,
    size: 20,
    searchOptions: {
      games: {
        userId: 0,
        platform: "",
        sortCategory: "popular",
        rangeCategory: "main",
        rangeTime: { min: null, max: null },
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

  payload[hpKey] = hpVal;

  return payload;
}

function parseResults(json: unknown): HltbSearchResult[] {
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
  }));
}

async function doSearch(
  query: string,
  session: AuthSession,
  signal?: AbortSignal,
): Promise<Response> {
  const searchUrl = `${BASE_URL}${searchPath}`;
  console.log("[HLTB] POST", searchUrl, "query:", query);

  return fetch(searchUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "*/*",
      Origin: BASE_URL,
      Referer: `${BASE_URL}`,
      "x-auth-token": session.token,
      "x-hp-key": session.hpKey,
      "x-hp-val": session.hpVal,
    },
    body: JSON.stringify(buildPayload(query, session.hpKey, session.hpVal)),
    signal,
  });
}

/**
 * Search HLTB via their unofficial API.
 * Obtains a session (token + fingerprint pair) from `${searchPath}/init`,
 * then POSTs to `${searchPath}` with the required auth headers and payload field.
 * On 403 (token expired) or 404 (path rotated under a warm session) it refreshes
 * the session — which re-runs path discovery — and retries once.
 * Results come back in HLTB's own ranking (exact name matches first).
 */
export async function searchHltb(
  query: string,
  signal?: AbortSignal,
): Promise<HltbSearchResult[]> {
  let session = await getSession(signal);
  if (signal?.aborted) return [];

  if (!session) {
    throw new Error("HLTB search failed: could not obtain session");
  }

  let response = await doSearch(query, session, signal);

  if (response.status === 403 || response.status === 404) {
    console.warn(`[HLTB] got ${response.status} — refreshing session and retrying`);
    invalidateSession();
    session = await getSession(signal);
    if (signal?.aborted) return [];
    if (!session) {
      throw new Error("HLTB search failed: could not obtain session after retry");
    }
    response = await doSearch(query, session, signal);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[HLTB] search failed:", response.status, body.slice(0, 200));
    throw new Error(`HLTB search failed: ${response.status}`);
  }

  const json = await response.json();
  console.log(
    "[HLTB] response keys:", Object.keys(json as object),
    "data length:", Array.isArray((json as { data?: unknown[] }).data)
      ? (json as { data: unknown[] }).data.length
      : "N/A",
  );

  return parseResults(json);
}
