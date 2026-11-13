import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { weekOf } from "./src/index.js";

// In-memory stand-in for D1: just enough for prepare/bind/batch/all.
function fakeDb() {
  const counts = new Map();
  return {
    counts,
    prepare: () => ({
      bind: (metric, period) => ({ metric, period }),
      all: async () => ({
        results: [...counts].map(([key, n]) => {
          const [metric, period] = key.split("|");
          return { metric, period, n };
        }),
      }),
    }),
    batch: async (stmts) => {
      for (const { metric, period } of stmts) {
        const key = `${metric}|${period}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    },
  };
}

const post = (body) =>
  new Request("https://stats.nexusgamelauncher.com/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("weekOf returns the Monday of the UTC week", () => {
  assert.equal(weekOf("2026-10-19"), "2026-10-19"); // Monday
  assert.equal(weekOf("2026-10-25"), "2026-10-19"); // Sunday
  assert.equal(weekOf("2026-11-01"), "2026-10-26"); // Sunday across a month edge
});

test("a ping adds to daily, version, and only the flagged week/month counters", async () => {
  const DB = fakeDb();
  const day = new Date().toISOString().slice(0, 10);

  let res = await worker.fetch(post({ version: "1.0.2", firstOpenThisWeek: true, firstOpenThisMonth: false }), { DB });
  assert.equal(res.status, 204);
  res = await worker.fetch(post({ version: "1.0.2", firstOpenThisWeek: false, firstOpenThisMonth: false, extra: "ignored" }), { DB });
  assert.equal(res.status, 204);

  assert.deepEqual(Object.fromEntries(DB.counts), {
    [`daily|${day}`]: 2,
    [`v1.0.2|${day}`]: 2,
    [`weekly|${weekOf(day)}`]: 1,
  });
});

test("bad input writes nothing", async () => {
  const DB = fakeDb();
  for (const body of [{}, { version: "1.0" }, { version: "<script>" }, { version: 1 }]) {
    assert.equal((await worker.fetch(post(body), { DB })).status, 400);
  }
  assert.equal(DB.counts.size, 0);
});

test("GET /raw returns every stored row; GET / renders them", async () => {
  const DB = fakeDb();
  await worker.fetch(post({ version: "1.0.2", firstOpenThisWeek: false, firstOpenThisMonth: true }), { DB });
  await worker.fetch(post({ version: "1.0.2", firstOpenThisWeek: false, firstOpenThisMonth: false }), { DB });

  const rows = await (await worker.fetch(new Request("https://stats.nexusgamelauncher.com/raw"), { DB })).json();
  assert.equal(rows.length, 3);

  const page = await worker.fetch(new Request("https://stats.nexusgamelauncher.com/"), { DB });
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  assert.match(html, /<span class="label">Today<\/span><strong>2<\/strong>/);
  assert.match(html, /v1\.0\.2/);
  assert.match(html, /href="\/raw"/);

  // The privacy promise: no scripts, nothing loaded from anywhere but this address.
  assert.doesNotMatch(html, /<script/i);
  const csp = page.headers.get("content-security-policy");
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /script-src|connect-src|https?:/);
});

test("the dashboard shows tabs, records and the striped current period", async () => {
  const { renderDashboard } = await import("./src/dashboard.js");
  const rows = [
    { metric: "daily", period: "2026-10-21", n: 3 },
    { metric: "daily", period: "2026-11-08", n: 7 },
    { metric: "daily", period: "2026-11-13", n: 2 },
    { metric: "weekly", period: "2026-11-02", n: 12 },
    { metric: "weekly", period: "2026-11-09", n: 6 },
    { metric: "monthly", period: "2026-10", n: 23 },
    { metric: "monthly", period: "2026-11", n: 17 },
    { metric: "v1.0.3", period: "2026-11-13", n: 2 },
  ];
  const html = renderDashboard(rows, new Date("2026-11-13T12:00:00Z"), weekOf);

  for (const id of ["r-day", "r-week", "r-month"]) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /<dt>Counting since<\/dt><dd><strong>Oct 21, 2026<\/strong><span>24 days<\/span>/);
  assert.match(html, /<dt>Best day<\/dt><dd><strong>7<\/strong><span>Sun, Nov 8<\/span>/);
  assert.match(html, /<dt>Best week<\/dt><dd><strong>12<\/strong><span>Week of Nov 2<\/span>/);
  assert.match(html, /<dt>Best month<\/dt><dd><strong>23<\/strong><span>October 2026<\/span>/);
  assert.match(html, /<span class="label">This month<\/span><strong>17<\/strong><span class="sub">October: 23<\/span>/);
  // Months start at the first month with data, so there are exactly two month bars.
  assert.equal(html.match(/<span class="tip"><b>[^<]+<\/b><span>(October|November) 2026( so far)?<\/span>/g).length, 2);
  assert.match(html, /<li class="now[^"]*"[^>]*><i><\/i><span class="tip"><b>2 installs<\/b><span>Today so far<\/span>/);
  // No empty bars from before counting began: days start Oct 21, weeks start Nov 2.
  assert.doesNotMatch(html, /Oct 20/);
  assert.equal(html.match(/<span class="tip"><b>[^<]+<\/b><span>(Week of [^<]+|This week so far)<\/span>/g).length, 2);
});
