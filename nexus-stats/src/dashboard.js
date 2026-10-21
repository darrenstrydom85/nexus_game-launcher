// The page at stats.nexusgamelauncher.com. Built from the same rows /raw
// returns, on the server, with no scripts, cookies or third-party requests.

const SOURCE = "https://github.com/darrenstrydom85/nexus_game-launcher/tree/main/nexus-stats";
const PRIVACY = "https://www.nexusgamelauncher.com/privacy.html#usage-count";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = 30;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmtDay = (day) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Rounds the axis top up to a round number close above v, so the gridline
// labels read cleanly without leaving half the chart empty.
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
}

function dailyChart(daily, today) {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i - DAYS + 1));
  const values = days.map((d) => daily.get(d) ?? 0);
  if (values.every((v) => v === 0)) return `<p class="empty">No counts yet.</p>`;

  const W = 720, H = 220, left = 48, right = 8, top = 14, bottom = 32;
  const plotW = W - left - right, plotH = H - top - bottom, base = top + plotH;
  const max = niceMax(Math.max(...values));
  const slot = plotW / DAYS;
  const bw = Math.min(24, slot - 2);
  const y = (v) => base - (v / max) * plotH;

  const bars = values.map((v, i) => {
    const x = left + i * slot + (slot - bw) / 2;
    const label = `${fmtDay(days[i])}: ${v} install${v === 1 ? "" : "s"}`;
    if (v === 0) {
      return `<rect class="hit" x="${x}" y="${top}" width="${bw}" height="${plotH}"><title>${label}</title></rect>`;
    }
    const yt = y(v), r = Math.min(4, bw / 2, base - yt);
    // 4px rounded data end, square at the baseline.
    const d = `M${x},${base}V${yt + r}Q${x},${yt} ${x + r},${yt}H${x + bw - r}Q${x + bw},${yt} ${x + bw},${yt + r}V${base}Z`;
    return `<g class="bar"><rect class="hit" x="${x}" y="${top}" width="${bw}" height="${plotH}"/><path d="${d}"/><title>${label}</title></g>`;
  });

  const grid = [max, max / 2].map(
    (v) => `<line x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/><text x="${left - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`,
  );
  // First and last labels align to the plot edges so they never clip.
  const ticks = [
    [0, left, "start"],
    [14, left + 14 * slot + slot / 2, "middle"],
    [DAYS - 1, W - right, "end"],
  ].map(([i, x, anchor]) => `<text x="${x}" y="${H - 6}" text-anchor="${anchor}">${fmtDay(days[i])}</text>`);

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily active installs over the last ${DAYS} days">
  <g class="grid">${grid.join("")}<line x1="${left}" x2="${W - right}" y1="${base}" y2="${base}"/><text x="${left - 8}" y="${base + 4}" text-anchor="end">0</text></g>
  ${bars.join("")}
  <g class="ticks">${ticks.join("")}</g>
</svg>`;
}

function versionList(rows, daily, today) {
  // Today's split, or the latest day that has one.
  const byDay = new Map();
  for (const r of rows) {
    if (!r.metric.startsWith("v")) continue;
    if (!byDay.has(r.period)) byDay.set(r.period, []);
    byDay.get(r.period).push(r);
  }
  const day = byDay.has(today) ? today : [...byDay.keys()].sort().pop();
  if (!day) return `<p class="empty">No counts yet.</p>`;
  const list = byDay.get(day).sort((a, b) => b.n - a.n);
  const total = daily.get(day) || list.reduce((s, r) => s + r.n, 0);
  const items = list.map((r) => {
    const pct = Math.round((r.n / total) * 100);
    return `<li><span class="ver">${esc(r.metric)}</span><span class="track"><span class="fill" style="width:${pct}%"></span></span><span class="num">${r.n} · ${pct}%</span></li>`;
  });
  return `<p class="note">${day === today ? "Today" : fmtDay(day)} (UTC)</p><ul class="versions">${items.join("")}</ul>`;
}

export function renderDashboard(rows, now, weekOf) {
  const today = now.toISOString().slice(0, 10);
  const pick = (metric) => new Map(rows.filter((r) => r.metric === metric).map((r) => [r.period, r.n]));
  const daily = pick("daily"), weekly = pick("weekly"), monthly = pick("monthly");

  const tiles = [
    ["Today", daily.get(today) ?? 0, "installs opened Nexus"],
    ["This week", weekly.get(weekOf(today)) ?? 0, `since Mon ${fmtDay(weekOf(today))}`],
    ["This month", monthly.get(today.slice(0, 7)) ?? 0, `in ${MONTHS[Number(today.slice(5, 7)) - 1]}`],
  ].map(([label, n, sub]) => `<div class="tile"><span class="label">${label}</span><strong>${n.toLocaleString("en-US")}</strong><span class="sub">${sub}</span></div>`);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nexus usage</title>
<meta name="description" content="How many people use Nexus, counted anonymously. Everything stored is on this page.">
<style>
  :root { color-scheme: dark; --bg: #09090b; --card: #101014; --line: #1f1f25; --line-2: #26262c; --fg: #f2f2f3; --fg-2: #b9b9c3; --muted: #9a9aa6; --faint: #6f6f7b; --accent: #7500db; --ink: #c9a4ff; --bar: #a06cf5; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.6 "Segoe UI", system-ui, -apple-system, sans-serif; }
  main { max-width: 880px; margin: 0 auto; padding: 48px 16px 64px; display: flex; flex-direction: column; gap: 20px; }
  h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); line-height: 1.1; letter-spacing: -.02em; }
  h2 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
  p { margin: 0; color: var(--fg-2); }
  a { color: var(--ink); }
  .lede { max-width: 640px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .btn { display: inline-flex; align-items: center; height: 38px; padding: 0 16px; border-radius: 19px; border: 1px solid var(--line-2); color: var(--fg); text-decoration: none; font-size: 14px; font-weight: 500; }
  .btn.primary { background: var(--accent); border-color: var(--accent); }
  .btn:hover { border-color: var(--ink); }
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
  .tile, .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; }
  .tile { display: flex; flex-direction: column; }
  .tile .label { color: var(--muted); font-size: 13px; }
  .tile strong { font-size: 36px; line-height: 1.2; font-variant-numeric: tabular-nums; }
  .tile .sub { color: var(--faint); font-size: 12.5px; }
  svg { display: block; width: 100%; height: auto; }
  svg text { fill: var(--faint); font-size: 11px; font-variant-numeric: tabular-nums; }
  .grid line { stroke: var(--line); stroke-width: 1; }
  .bar path { fill: var(--bar); }
  .bar:hover path { fill: var(--ink); }
  .hit { fill: transparent; }
  .note { color: var(--muted); font-size: 13px; margin-bottom: 8px; }
  .versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .versions li { display: grid; grid-template-columns: 72px 1fr 11ch; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; }
  .ver { font-family: "Cascadia Code", Consolas, monospace; font-size: 13px; }
  .track { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 4px; background: var(--bar); }
  .num { color: var(--fg-2); font-size: 13px; text-align: right; }
  .empty { color: var(--muted); padding: 24px 0; text-align: center; }
  footer p { color: var(--faint); font-size: 13px; }
  /* The chart scales to ~0.45x on phones; bump its text so it stays ~11px on screen. */
  @media (max-width: 560px) { svg text { font-size: 24px; } }
</style>
</head>
<body>
<main>
  <h1>Nexus usage</h1>
  <p class="lede">Once a day, each copy of Nexus sends one anonymous “opened today” count and its version number. No IDs, no IP addresses, nothing about anyone. This page is built from everything that’s stored.</p>
  <div class="actions">
    <a class="btn primary" href="/raw">View raw data</a>
    <a class="btn" href="${SOURCE}">Read the code</a>
    <a class="btn" href="${PRIVACY}">How it works</a>
  </div>
  <section class="tiles" aria-label="Active installs">${tiles.join("")}</section>
  <section class="card"><h2>Daily active installs, last ${DAYS} days</h2>${dailyChart(daily, today)}</section>
  <section class="card"><h2>Versions in use</h2>${versionList(rows, daily, today)}</section>
  <footer><p>Days, weeks (starting Monday) and months are in UTC. <a href="https://www.nexusgamelauncher.com">nexusgamelauncher.com</a></p></footer>
</main>
</body>
</html>`;
}
