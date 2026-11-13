// The page at stats.nexusgamelauncher.com, built on the server from the same
// rows /raw returns. No scripts and no cookies. The only other files it loads
// (logo and fonts, in public/) come from this same address, so the page can't
// tell anyone you visited. The tabs and hover cards are plain CSS.

const SITE = "https://www.nexusgamelauncher.com";
const SOURCE = "https://github.com/darrenstrydom85/nexus_game-launcher/tree/main/nexus-stats";
const REPO = "https://github.com/darrenstrydom85/nexus_game-launcher";
const PRIVACY = `${SITE}/privacy.html#usage-count`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS = 30, WEEKS = 12, MAX_MONTHS = 12;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (v) => v.toLocaleString("en-US");
const installs = (v) => `${fmt(v)} install${v === 1 ? "" : "s"}`;
const utc = (day) => new Date(`${day}T00:00:00Z`);
const addDays = (day, k) => {
  const d = utc(day);
  d.setUTCDate(d.getUTCDate() + k);
  return d.toISOString().slice(0, 10);
};
const addMonths = (ym, k) => {
  const d = utc(`${ym}-01`);
  d.setUTCMonth(d.getUTCMonth() + k);
  return d.toISOString().slice(0, 7);
};
const shortDay = (day) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
const longDay = (day) => `${WEEKDAYS[utc(day).getUTCDay()]}, ${shortDay(day)}`;
const fullDay = (day) => `${shortDay(day)}, ${day.slice(0, 4)}`;
const shortMonth = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
const longMonth = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// Rounds the axis top up to a round number close above v, so the gridline
// labels read cleanly without leaving half the chart empty.
function niceMax(v) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((m) => m >= v);
}

// The highest value in a period → count map, earliest period on a tie.
function best(map) {
  let top = null;
  for (const [period, n] of [...map].sort(([a], [b]) => a.localeCompare(b))) {
    if (!top || n > top.n) top = { period, n };
  }
  return top;
}

// The last n periods up to `end`, but none before counting began (`first`):
// empty bars from before then would read as nobody using Nexus.
function periodsTo(end, n, step, first = end) {
  const out = [];
  for (let p = end; out.length < n && p >= first; p = step(p, -1)) out.unshift(p);
  return out;
}

// `count` evenly spaced axis labels; every bar gets one when there are only a few.
function ticksFor(periods, label, count, nowLabel) {
  const last = periods.length - 1;
  const idx = periods.length <= Math.max(6, count) ? periods.map((_, i) => i)
    : Array.from({ length: count }, (_, k) => Math.round((k * last) / (count - 1)));
  return Object.fromEntries(idx.map((i) => [i, i === last && nowLabel ? nowLabel : label(periods[i])]));
}

// One bar chart. points: [{ value, tip, now }], oldest first. ticks: index → axis label.
function barChart(points, ticks, caption) {
  if (points.every((p) => p.value === 0)) return `<p class="empty">No counts yet.</p>`;
  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const last = points.length - 1;
  const many = points.length > 6;

  const bars = points.map((p, i) => {
    const h = (p.value / max) * 100;
    const cls = [
      p.now && "now",
      h > 62 && "hi", // tall bar: the hover card sits inside the plot instead of above it
      many && i < 2 && "l", // hover cards near the edges open inward
      many && i > last - 2 && "r",
    ].filter(Boolean).join(" ");
    return `<li${cls ? ` class="${cls}"` : ""} style="--h:${h.toFixed(1)}%;--i:${i}"><i></i><span class="tip"><b>${installs(p.value)}</b><span>${p.tip}</span></span></li>`;
  });
  const mid = max / 2;
  const yLabels = [[max, 100], ...(Number.isInteger(mid) ? [[mid, 50]] : []), [0, 0]]
    .map(([v, at]) => `<span style="bottom:${at}%">${fmt(v)}</span>`).join("");
  const xLabels = points.map((_, i) =>
    `<span${many && i === 0 ? ' class="l"' : many && i === last ? ' class="r"' : ""}>${ticks[i] ?? ""}</span>`).join("");

  return `<figure class="chart">
      <div class="y" aria-hidden="true" style="width:${fmt(max).length + 1}ch">${yLabels}</div>
      <ol class="bars" aria-label="${caption}">${bars.join("")}</ol>
      <div class="x" aria-hidden="true">${xLabels}</div>
    </figure>`;
}

function versionList(rows, daily, today) {
  // Today's split, or the latest day that has one.
  const byDay = new Map();
  for (const r of rows) {
    if (!/^v\d/.test(r.metric)) continue;
    if (!byDay.has(r.period)) byDay.set(r.period, []);
    byDay.get(r.period).push(r);
  }
  const day = byDay.has(today) ? today : [...byDay.keys()].sort().pop();
  if (!day) return `<p class="empty">No counts yet.</p>`;
  const list = byDay.get(day).sort((a, b) => b.n - a.n);
  const total = daily.get(day) || list.reduce((s, r) => s + r.n, 0);
  const items = list.map((r) => {
    const pct = Math.round((r.n / total) * 100);
    return `<li><span class="ver">${esc(r.metric)}</span><span class="track"><span class="fill" style="width:${pct}%"></span></span><span class="num">${fmt(r.n)} <span>· ${pct}%</span></span></li>`;
  });
  return `<p class="note">${day === today ? "Today" : longDay(day)}, by version</p><ul class="versions">${items.join("")}</ul>`;
}

export function renderDashboard(rows, now, weekOf) {
  const today = now.toISOString().slice(0, 10);
  const thisWeek = weekOf(today), thisMonth = today.slice(0, 7);
  const pick = (metric) => new Map(rows.filter((r) => r.metric === metric).map((r) => [r.period, r.n]));
  const daily = pick("daily"), weekly = pick("weekly"), monthly = pick("monthly");
  const lastWeek = addDays(thisWeek, -7), lastMonth = addMonths(thisMonth, -1);

  // ── Tiles ──
  const tiles = [
    ["Today", daily.get(today) ?? 0, `${longDay(today)} · so far`],
    ["This week", weekly.get(thisWeek) ?? 0, `Last week: ${fmt(weekly.get(lastWeek) ?? 0)}`],
    ["This month", monthly.get(thisMonth) ?? 0, `${MONTHS_LONG[Number(lastMonth.slice(5, 7)) - 1]}: ${fmt(monthly.get(lastMonth) ?? 0)}`],
  ].map(([label, n, sub]) =>
    `<div class="tile"><span class="label">${label}</span><strong>${fmt(n)}</strong><span class="sub">${sub}</span></div>`);

  // ── Charts ──
  const first = (map) => [...map.keys()].sort()[0];

  const days = periodsTo(today, DAYS, addDays, first(daily));
  const dayChart = barChart(
    days.map((d) => ({ value: daily.get(d) ?? 0, tip: d === today ? "Today so far" : longDay(d), now: d === today })),
    ticksFor(days, shortDay, 4, "Today"),
    "Installs that opened Nexus each day",
  );

  const weeks = periodsTo(thisWeek, WEEKS, (w, k) => addDays(w, 7 * k), first(weekly));
  const weekChart = barChart(
    weeks.map((w) => ({ value: weekly.get(w) ?? 0, tip: w === thisWeek ? "This week so far" : `Week of ${shortDay(w)}`, now: w === thisWeek })),
    ticksFor(weeks, shortDay, 3, "This week"),
    "Installs that opened Nexus each week",
  );

  const months = periodsTo(thisMonth, MAX_MONTHS, addMonths, first(monthly));
  const monthChart = barChart(
    months.map((m) => ({ value: monthly.get(m) ?? 0, tip: m === thisMonth ? `${longMonth(m)} so far` : longMonth(m), now: m === thisMonth })),
    ticksFor(months, shortMonth, MAX_MONTHS),
    "Installs that opened Nexus each month",
  );

  // ── All time ──
  const since = [...daily.keys()].sort()[0];
  const bestDay = best(daily), bestWeek = best(weekly), bestMonth = best(monthly);
  const record = (label, value, sub) => `<div><dt>${label}</dt><dd><strong>${value}</strong><span>${sub}</span></dd></div>`;
  const records = [
    since
      ? record("Counting since", fullDay(since), `${fmt(Math.round((utc(today) - utc(since)) / 864e5) + 1)} days`)
      : record("Counting since", "Not yet", "Waiting for the first count"),
    record("Best day", bestDay ? fmt(bestDay.n) : "–", bestDay ? longDay(bestDay.period) : "No counts yet"),
    record("Best week", bestWeek ? fmt(bestWeek.n) : "–", bestWeek ? `Week of ${shortDay(bestWeek.period)}` : "No counts yet"),
    record("Best month", bestMonth ? fmt(bestMonth.n) : "–", bestMonth ? longMonth(bestMonth.period) : "No counts yet"),
  ];

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nexus usage stats</title>
<meta name="description" content="How many people use Nexus, counted anonymously. Everything stored is on this page.">
<meta name="theme-color" content="#09090b">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="preload" href="/fonts/geist-sans-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<style>
  @font-face { font-family: "Geist"; src: url("/fonts/geist-sans-latin-400-normal.woff2") format("woff2"); font-weight: 400; font-display: swap; }
  @font-face { font-family: "Geist"; src: url("/fonts/geist-sans-latin-600-normal.woff2") format("woff2"); font-weight: 600; font-display: swap; }
  @font-face { font-family: "Geist"; src: url("/fonts/geist-sans-latin-800-normal.woff2") format("woff2"); font-weight: 800; font-display: swap; }
  @font-face { font-family: "Geist Mono"; src: url("/fonts/geist-mono-latin-400-normal.woff2") format("woff2"); font-weight: 400; font-display: swap; }
  :root {
    color-scheme: dark;
    --bg: #09090b; --bar: #0c0c0f; --card: #101014; --chip: #141418; --raised: #1f1f25;
    --line: #1f1f25; --line-2: #26262c; --line-3: #2a2a31;
    --fg: #f2f2f3; --fg-2: #b9b9c3; --muted: #9a9aa6; --faint: #6f6f7b;
    --accent: #7500db; --accent-ink: #c9a4ff; --accent-ink-hover: #e4d1ff;
    --font: "Geist", "Segoe UI", system-ui, -apple-system, sans-serif;
    --mono: "Geist Mono", "Cascadia Code", Consolas, monospace;
    --ease-out: cubic-bezier(.23, 1, .32, 1);
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; color: var(--fg); font: 15px/1.5 var(--font); -webkit-font-smoothing: antialiased;
    background: radial-gradient(ellipse 60% 420px at 50% -80px, rgba(117, 0, 219, .32), transparent 70%) no-repeat, var(--bg); }
  h1, h2, p, figure, ul, ol, dl, dd { margin: 0; }
  a { color: var(--accent-ink); text-decoration: none; }
  a:hover { color: var(--accent-ink-hover); }
  :focus-visible { outline: 2px solid var(--accent-ink); outline-offset: 2px; border-radius: 6px; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; opacity: 0; }
  .wrap { width: min(100% - 32px, 960px); margin-inline: auto; }

  /* Top bar and footer, as on nexusgamelauncher.com */
  .topbar { border-bottom: 1px solid #1d1d21; background: rgba(12, 12, 15, .82); }
  .topbar .wrap { display: flex; align-items: center; gap: 12px; min-height: 60px; }
  .brand { display: flex; align-items: center; gap: 10px; color: var(--fg); font-weight: 600; letter-spacing: -.01em; }
  .brand:hover { color: var(--fg); }
  .brand img { width: 22px; height: 22px; }
  .chip-tag { font: 400 11px var(--mono); color: var(--accent-ink); padding: 1px 6px; border: 1px solid #3b2a55; border-radius: 6px; background: #170f24; }
  .topbar nav { margin-left: auto; display: flex; gap: 8px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 10px; font-size: 14px; font-weight: 600; white-space: nowrap; color: var(--fg); background: #1a1a1f; border: 1px solid var(--line-3); transition: background-color .16s var(--ease-out), scale .16s var(--ease-out); }
  .btn:hover { background: #222228; color: var(--fg); }
  .btn:active { scale: .96; }
  .btn.accent { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 10px 30px rgba(117, 0, 219, .3); }
  .btn.accent:hover { background: #8410f0; }
  footer { margin-top: 72px; border-top: 1px solid #1d1d21; background: var(--bar); padding: 28px 0; }
  footer .wrap { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; color: var(--faint); font-size: 13.5px; }
  footer .brand { font-size: 13.5px; font-weight: 400; color: var(--muted); gap: 8px; }
  footer .brand img { width: 18px; height: 18px; opacity: .8; }
  footer nav { display: flex; flex-wrap: wrap; gap: 4px 20px; }
  footer nav a { color: #a6a6b0; }
  footer nav a:hover { color: var(--fg); }

  /* Hero */
  main { display: flex; flex-direction: column; gap: 16px; padding-top: 56px; }
  .hero { display: flex; flex-direction: column; gap: 18px; margin-bottom: 20px; }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--accent-ink); }
  h1 { font-size: clamp(38px, 7vw, 72px); font-weight: 800; text-transform: uppercase; line-height: .92; letter-spacing: .005em; }
  .lede { color: var(--fg-2); font-size: 16px; max-width: 620px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }

  /* Cards */
  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
  .tile, .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; }
  .tile { display: flex; flex-direction: column; gap: 4px; padding: 22px 24px; }
  .tile .label { color: var(--muted); font-size: 13.5px; }
  .tile strong { font-size: 40px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .tile .sub { color: var(--faint); font-size: 13px; }
  .card { padding: 22px 24px; min-width: 0; }
  .card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
  h2 { font-size: 16px; font-weight: 600; }
  .note { color: var(--muted); font-size: 13.5px; margin-bottom: 14px; }
  .empty { color: var(--muted); padding: 40px 0; text-align: center; }
  .pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }

  /* Range tabs: radio buttons, so they switch with no script */
  .tabs { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--chip); border: 1px solid var(--line-2); }
  .tabs label { height: 32px; padding: 0 14px; border-radius: 9px; display: inline-flex; align-items: center; color: #a6a6b0; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background-color .16s var(--ease-out), color .16s var(--ease-out); }
  .tabs label:hover { color: var(--fg); }
  .tabs input:checked + label { background: var(--raised); color: var(--fg); box-shadow: inset 0 0 0 1px #34343c; }
  .tabs input:focus-visible + label { outline: 2px solid var(--accent-ink); outline-offset: 1px; }
  .panel { display: none; animation: fade .3s var(--ease-out); }
  #activity:has(#r-day:checked) .p-day,
  #activity:has(#r-week:checked) .p-week,
  #activity:has(#r-month:checked) .p-month { display: block; }
  @supports not selector(:has(a)) { .p-day { display: block; } .tabs { display: none; } }
  @keyframes fade { from { opacity: 0; transform: translateY(4px); } }

  /* Bar chart */
  .chart { display: grid; grid-template-columns: auto 1fr; grid-template-rows: 220px auto; column-gap: 10px; }
  .y { position: relative; color: var(--faint); font: 11.5px var(--mono); text-align: right; }
  .y span { position: absolute; right: 0; transform: translateY(50%); }
  .bars { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-end; gap: 3px; border-bottom: 1px solid var(--line-2);
    background: linear-gradient(var(--line) 0 0) top / 100% 1px no-repeat, linear-gradient(var(--line) 0 0) center / 100% 1px no-repeat; }
  .bars li { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; border-radius: 6px 6px 0 0; }
  .bars li:hover { background: rgba(255, 255, 255, .03); }
  .bars i { display: block; width: 100%; max-width: 56px; height: var(--h); border-radius: 4px 4px 0 0;
    background: linear-gradient(to top, #6200b8, #a06cf5); transform-origin: bottom;
    animation: grow .6s var(--ease-out) both; animation-delay: calc(var(--i) * 14ms); transition: filter .16s var(--ease-out); }
  .bars li:hover i { filter: brightness(1.25); }
  .bars li.now i { background: repeating-linear-gradient(135deg, #a06cf5 0 5px, #7a3fd6 5px 10px); }
  @keyframes grow { from { transform: scaleY(0); } }
  .tip { position: absolute; z-index: 2; left: 50%; bottom: calc(var(--h) + 10px); translate: -50% 4px; opacity: 0; pointer-events: none;
    display: flex; flex-direction: column; padding: 8px 12px; border-radius: 10px; background: #1c1c21; border: 1px solid #34343c;
    box-shadow: 0 12px 32px rgba(0, 0, 0, .5); white-space: nowrap; font-size: 12.5px; line-height: 1.4; transition: opacity .14s var(--ease-out), translate .14s var(--ease-out); }
  .tip b { font-size: 14px; font-weight: 600; }
  .tip span { color: var(--muted); }
  .bars li:hover .tip { opacity: 1; translate: -50% 0; }
  .bars li.hi .tip { bottom: auto; top: calc(100% - var(--h) + 10px); }
  .bars li.l .tip { left: 0; translate: 0 4px; }
  .bars li.r .tip { left: auto; right: 0; translate: 0 4px; }
  .bars li.l:hover .tip, .bars li.r:hover .tip { translate: 0 0; }
  .x { grid-column: 2; display: flex; gap: 3px; padding-top: 8px; color: var(--faint); font-size: 12px; white-space: nowrap; }
  .x span { flex: 1; min-width: 0; display: flex; justify-content: center; }
  .x .l { justify-content: flex-start; }
  .x .r { justify-content: flex-end; }
  .legend { display: flex; align-items: center; gap: 8px; margin-top: 14px; color: var(--faint); font-size: 12.5px; }
  .legend i { width: 12px; height: 12px; border-radius: 3px; background: repeating-linear-gradient(135deg, #a06cf5 0 3px, #7a3fd6 3px 6px); }

  /* All time */
  .records { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .records div { padding: 14px 16px; border-radius: 12px; background: #0d0d10; border: 1px solid var(--line); }
  .records dt { color: var(--muted); font-size: 12.5px; }
  .records dd { display: flex; flex-direction: column; }
  .records strong { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .records dd span { color: var(--faint); font-size: 12.5px; }

  /* Versions */
  .versions { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .versions li { display: grid; grid-template-columns: 64px 1fr auto; align-items: center; gap: 12px; font-variant-numeric: tabular-nums; }
  .ver { font: 13px var(--mono); }
  .track { height: 8px; border-radius: 4px; background: var(--line); overflow: hidden; }
  .fill { display: block; height: 100%; border-radius: 4px; background: linear-gradient(to right, #6200b8, #a06cf5); }
  .num { font-size: 13.5px; font-weight: 600; text-align: right; }
  .num span { color: var(--faint); font-weight: 400; }

  /* What the numbers mean */
  .facts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 28px; }
  .facts b { display: block; font-weight: 600; margin-bottom: 4px; }
  .facts li { color: var(--fg-2); font-size: 14px; }

  @media (max-width: 560px) {
    .topbar nav .btn:not(.accent) { display: none; }
    .card, .tile { padding: 18px; }
    .chart { grid-template-rows: 180px auto; }
    .bars, .x { gap: 2px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .bars i, .panel { animation: none; }
    .tip, .btn, .tabs label { transition: none; }
  }
</style>
</head>
<body>
<header class="topbar">
  <div class="wrap">
    <a class="brand" href="${SITE}"><img src="/nexus-logo.png" alt="" width="22" height="22">Nexus <span class="chip-tag">stats</span></a>
    <nav aria-label="Main">
      <a class="btn" href="${REPO}">GitHub</a>
      <a class="btn accent" href="${SITE}/#download">Download</a>
    </nav>
  </div>
</header>

<main class="wrap">
  <section class="hero">
    <span class="eyebrow">Public usage stats</span>
    <h1>How many people<br>use Nexus</h1>
    <p class="lede">Once a day, each copy of Nexus sends one anonymous “opened today” count and its version number. No IDs, no IP addresses, nothing about anyone. This page is built live from all ${fmt(rows.length)} stored rows.</p>
    <div class="actions">
      <a class="btn accent" href="/raw">View raw data</a>
      <a class="btn" href="${SOURCE}">Read the code</a>
      <a class="btn" href="${PRIVACY}">How it works</a>
    </div>
  </section>

  <section class="tiles" aria-label="Active installs">${tiles.join("")}</section>

  <section class="card" id="activity" aria-labelledby="activity-h">
    <div class="card-head">
      <h2 id="activity-h">Active installs</h2>
      <div class="tabs" role="radiogroup" aria-label="Time range">
        <input class="sr-only" type="radio" name="range" id="r-day" checked><label for="r-day">Days</label>
        <input class="sr-only" type="radio" name="range" id="r-week"><label for="r-week">Weeks</label>
        <input class="sr-only" type="radio" name="range" id="r-month"><label for="r-month">Months</label>
      </div>
    </div>
    <div class="panel p-day"><p class="note">Installs that opened Nexus each day, last ${DAYS} days. Hover a bar for the number.</p>${dayChart}</div>
    <div class="panel p-week"><p class="note">Installs that opened Nexus at least once each week (Monday to Sunday), last ${WEEKS} weeks.</p>${weekChart}</div>
    <div class="panel p-month"><p class="note">Installs that opened Nexus at least once each month.</p>${monthChart}</div>
    <p class="legend"><i></i>Striped: the day, week or month isn’t over yet</p>
  </section>

  <div class="pair">
    <section class="card" aria-labelledby="records-h">
      <div class="card-head"><h2 id="records-h">All time</h2></div>
      <dl class="records">${records.join("")}</dl>
    </section>
    <section class="card" aria-labelledby="versions-h">
      <div class="card-head"><h2 id="versions-h">Versions in use</h2></div>
      ${versionList(rows, daily, today)}
    </section>
  </div>

  <section class="card" aria-labelledby="facts-h">
    <div class="card-head"><h2 id="facts-h">What the numbers mean</h2></div>
    <ul class="facts">
      <li><b>Installs, not people</b>Nexus on two PCs counts twice. Opening it five times in a day still counts once.</li>
      <li><b>Each period counts an install once</b>Today, a week and a month each count an install the first time it opens in that period.</li>
      <li><b>No all-time total</b>Without an ID there’s no way to tell a returning install from a new one across months. That’s the trade for not tracking anyone.</li>
      <li><b>Only if you say yes</b>Nexus sends nothing until you’ve seen the notice, and you can turn “Count me as a user” off in Settings at any time.</li>
    </ul>
  </section>
</main>

<footer>
  <div class="wrap">
    <span class="brand"><img src="/nexus-logo.png" alt="" width="18" height="18">Days, weeks (from Monday) and months are in UTC.</span>
    <nav aria-label="Footer">
      <a href="${SITE}">nexusgamelauncher.com</a>
      <a href="${PRIVACY}">Privacy</a>
      <a href="${SOURCE}">Source</a>
      <a href="/raw">Raw data</a>
    </nav>
  </div>
</footer>
</body>
</html>`;
}
