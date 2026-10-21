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
});
