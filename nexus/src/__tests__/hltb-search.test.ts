import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

const SESSION = { token: "tok", hpKey: "ign_abc", hpVal: "val" };
const GAME = { game_id: 1, game_name: "Hades", comp_main: 3600, comp_plus: 7200, comp_100: 10800 };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status });
}

async function loadModule() {
  vi.resetModules();
  return import("@/lib/hltb");
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("searchHltb", () => {
  it("inits a session then POSTs the search with auth headers and fingerprint field", async () => {
    mockFetch
      .mockResolvedValueOnce(json(SESSION))
      .mockResolvedValueOnce(json({ data: [GAME] }));
    const { searchHltb } = await loadModule();

    const results = await searchHltb("Hades");

    expect(results).toEqual([
      { id: 1, name: "Hades", gameplayMain: 1, gameplayMainExtra: 2, gameplayCompletionist: 3 },
    ]);
    expect(mockFetch.mock.calls[0][0]).toMatch(
      /^https:\/\/howlongtobeat\.com\/api\/search\/site\/init\?t=\d+$/,
    );
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe("https://howlongtobeat.com/api/search/site");
    expect(init.headers).toMatchObject({
      "x-auth-token": "tok",
      "x-hp-key": "ign_abc",
      "x-hp-val": "val",
    });
    const body = JSON.parse(init.body);
    expect(body.searchTerms).toEqual(["Hades"]);
    expect(body.ign_abc).toBe("val");
  });

  it("rediscovers the search path from the site bundles when init 404s", async () => {
    mockFetch
      .mockResolvedValueOnce(text("not found", 404))
      .mockResolvedValueOnce(
        text(
          '<script src="/_next/static/chunks/a.js" defer=""></script>' +
            '<script src="/_next/static/chunks/b.js" defer=""></script>',
        ),
      )
      .mockResolvedValueOnce(text("nothing relevant here"))
      .mockResolvedValueOnce(text("fetch(`/api/search/rotated/init?t=${Date.now()}`)"))
      .mockResolvedValueOnce(json(SESSION))
      .mockResolvedValueOnce(json({ data: [GAME] }));
    const { searchHltb } = await loadModule();

    const results = await searchHltb("Hades");

    expect(results).toHaveLength(1);
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls[1]).toBe("https://howlongtobeat.com/");
    expect(urls[2]).toBe("https://howlongtobeat.com/_next/static/chunks/a.js");
    expect(urls[3]).toBe("https://howlongtobeat.com/_next/static/chunks/b.js");
    expect(urls[4]).toMatch(/^https:\/\/howlongtobeat\.com\/api\/search\/rotated\/init\?t=/);
    expect(urls[5]).toBe("https://howlongtobeat.com/api/search/rotated");
  });

  it("rediscovers the path when the search POST 404s under a warm session", async () => {
    mockFetch
      .mockResolvedValueOnce(json(SESSION))
      .mockResolvedValueOnce(text("not found", 404))
      .mockResolvedValueOnce(text("not found", 404))
      .mockResolvedValueOnce(text('<script src="/_next/static/chunks/a.js"></script>'))
      .mockResolvedValueOnce(text("fetch(`/api/search/rotated/init?t=${Date.now()}`)"))
      .mockResolvedValueOnce(json(SESSION))
      .mockResolvedValueOnce(json({ data: [GAME] }));
    const { searchHltb } = await loadModule();

    const results = await searchHltb("Hades");

    expect(results).toHaveLength(1);
    const urls = mockFetch.mock.calls.map((c) => c[0] as string);
    expect(urls[1]).toBe("https://howlongtobeat.com/api/search/site");
    expect(urls[3]).toBe("https://howlongtobeat.com/");
    expect(urls[6]).toBe("https://howlongtobeat.com/api/search/rotated");
  });

  it("throws when init fails and no path can be discovered, and does not re-scan bundles within the cooldown", async () => {
    mockFetch
      .mockResolvedValueOnce(text("not found", 404))
      .mockResolvedValueOnce(text("<html></html>"))
      .mockResolvedValueOnce(text("not found", 404));
    const { searchHltb } = await loadModule();

    await expect(searchHltb("Hades")).rejects.toThrow("could not obtain session");
    expect(mockFetch.mock.calls[1][0]).toBe("https://howlongtobeat.com/");

    await expect(searchHltb("Hades")).rejects.toThrow("could not obtain session");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
