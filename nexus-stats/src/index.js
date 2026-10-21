// Nexus usage count: https://stats.nexusgamelauncher.com
//
// Once a day the app POSTs { version, firstOpenThisWeek, firstOpenThisMonth }.
// This Worker adds 1 to a few counters and stores nothing else: no ID, no IP,
// no time beyond the day. GET returns the whole database, so anyone can check.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Monday of the UTC week containing `day` (YYYY-MM-DD). The app uses the same
// function to decide firstOpenThisWeek, so both sides agree on week edges.
export function weekOf(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    if (request.method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT metric, period, n FROM counts ORDER BY period DESC, metric",
      ).all();
      return json(results);
    }

    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    if (Number(request.headers.get("content-length") ?? 0) > 512) return json({ error: "too large" }, 413);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    const { version, firstOpenThisWeek, firstOpenThisMonth } = body ?? {};
    if (typeof version !== "string" || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(version)) {
      return json({ error: "bad version" }, 400);
    }

    const day = new Date().toISOString().slice(0, 10);
    const rows = [
      ["daily", day],
      [`v${version}`, day],
    ];
    if (firstOpenThisWeek === true) rows.push(["weekly", weekOf(day)]);
    if (firstOpenThisMonth === true) rows.push(["monthly", day.slice(0, 7)]);

    const upsert = env.DB.prepare(
      "INSERT INTO counts (metric, period, n) VALUES (?1, ?2, 1) ON CONFLICT (metric, period) DO UPDATE SET n = n + 1",
    );
    await env.DB.batch(rows.map(([metric, period]) => upsert.bind(metric, period)));
    return new Response(null, { status: 204, headers: CORS });
  },
};
