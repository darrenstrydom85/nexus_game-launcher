/**
 * Stats export builders for the Settings "Export Stats" section.
 *
 * Two outputs share one data pipeline (a {@link WrappedReport} for the selected
 * range + the full list of completed games):
 *  - `buildStatsHtml` -> a self-contained HTML page (paired with an `assets/`
 *    folder packaged by the `export_stats_zip` Tauri command). Cover images are
 *    referenced by relative path, never base64-embedded.
 *  - `buildStatsJson` -> a versioned, data-only JSON document for integrators.
 */

import { formatPlayTime } from "@/lib/utils";
import { toDateStr, type StatsDateRange } from "@/lib/statsRange";
import type { Game } from "@/stores/gameStore";

// ---------------------------------------------------------------------------
// Backend report types (mirror nexus/src-tauri/src/models/wrapped.rs, camelCase)
// ---------------------------------------------------------------------------

export interface WrappedGame {
  id: string;
  name: string;
  coverUrl: string | null;
  heroUrl: string | null;
  logoUrl: string | null;
  playTimeS: number;
  sessionCount: number;
  source: string;
}

export interface WrappedSession {
  gameId: string;
  gameName: string;
  startedAt: string;
  durationS: number;
}

export interface GenreShare {
  name: string;
  playTimeS: number;
  percent: number;
}

export interface PlatformShare {
  source: string;
  playTimeS: number;
  percent: number;
}

export interface FunFact {
  kind: string;
  value: number;
  label: string;
}

export interface Comparison {
  previousTotalS: number;
  percentChange: number;
  label: string;
}

export interface MonthBucket {
  month: number;
  playTimeS: number;
}

export interface DayBucket {
  day: number;
  playTimeS: number;
}

export interface HourBucket {
  hour: number;
  playTimeS: number;
}

export interface HiddenGem {
  gameId: string;
  name: string;
  playTimeS: number;
  rating: number | null;
  tagline: string;
}

export interface WrappedReport {
  periodLabel: string;
  totalPlayTimeS: number;
  totalSessions: number;
  totalGamesPlayed: number;
  totalGamesInLibrary: number;
  newGamesAdded: number;
  newTitlesInPeriod: number;
  mostPlayedGame: WrappedGame | null;
  mostPlayedGenre: string | null;
  topGames: WrappedGame[];
  genreBreakdown: GenreShare[];
  genreTagline: string | null;
  platformBreakdown: PlatformShare[];
  longestSession: WrappedSession | null;
  longestStreakDays: number;
  busiestDay: string | null;
  busiestDayPlayTimeS: number;
  firstGamePlayed: WrappedGame | null;
  lastGamePlayed: WrappedGame | null;
  playTimeByMonth: MonthBucket[];
  playTimeByDayOfWeek: DayBucket[];
  playTimeByHourOfDay: HourBucket[];
  funFacts: FunFact[];
  comparisonPreviousPeriod: Comparison | null;
  moodTagline: string | null;
  hiddenGem: HiddenGem | null;
  trivia: string[];
}

/** Period selector accepted by the `get_wrapped_report` command. */
export type WrappedPeriod = {
  custom: { startDate: string; endDate: string };
};

// ---------------------------------------------------------------------------
// Period mapping
// ---------------------------------------------------------------------------

export interface ResolvedExportPeriod {
  /** Argument for `invoke("get_wrapped_report", { period })`. */
  period: WrappedPeriod;
  /** Discriminator used in the JSON document. */
  type: "custom" | "all";
  startDate: string;
  endDate: string;
  /** Human label used in the HTML header and JSON. */
  label: string;
}

const EARLIEST_FALLBACK = "1970-01-01";

/**
 * Maps a stats {@link StatsDateRange} onto a concrete report period. "All time"
 * becomes a custom range from the earliest known date (or 1970) through today,
 * labelled "All Time".
 */
export function mapRangeToPeriod(
  range: StatsDateRange,
  earliestDate?: string,
): ResolvedExportPeriod {
  const today = toDateStr(new Date());
  if (range === "all") {
    const startDate = earliestDate || EARLIEST_FALLBACK;
    return {
      period: { custom: { startDate, endDate: today } },
      type: "all",
      startDate,
      endDate: today,
      label: "All Time",
    };
  }
  return {
    period: { custom: { startDate: range.start, endDate: range.end } },
    type: "custom",
    startDate: range.start,
    endDate: range.end,
    label: `${formatDateLabel(range.start)} – ${formatDateLabel(range.end)}`,
  };
}

// ---------------------------------------------------------------------------
// Asset collection
// ---------------------------------------------------------------------------

export interface ExportAsset {
  source: string;
  relPath: string;
}

export interface CollectedAssets {
  assets: ExportAsset[];
  /** Relative path the HTML should reference for a game's cover, or null. */
  relPathFor: (gameId: string) => string | null;
  /** Relative path of the most-played game's hero banner, or null. */
  mostPlayedHero: string | null;
  /** Relative path of the most-played game's transparent logo, or null. */
  mostPlayedLogo: string | null;
}

/**
 * Gathers cover images referenced by the export (top games, most played, and
 * every completed game), de-duplicated by game id. Completed games are added
 * first so a user's custom cover wins over the report's stored cover.
 */
export function collectAssets(args: {
  report: WrappedReport;
  completedGames: Game[];
}): CollectedAssets {
  const { report, completedGames } = args;
  const relPaths = new Map<string, string>();
  const assets: ExportAsset[] = [];

  const add = (id: string | null | undefined, source: string | null | undefined) => {
    if (!id || !source) return;
    if (relPaths.has(id)) return;
    const relPath = `assets/covers/${sanitizeId(id)}.${extFromSource(source)}`;
    relPaths.set(id, relPath);
    assets.push({ source, relPath });
  };

  for (const g of completedGames) add(g.id, g.customCover ?? g.coverUrl);
  if (report.mostPlayedGame) add(report.mostPlayedGame.id, report.mostPlayedGame.coverUrl);
  for (const g of report.topGames ?? []) add(g.id, g.coverUrl);

  // Spotlight extras: hero banner + transparent logo for the most-played game.
  let mostPlayedHero: string | null = null;
  let mostPlayedLogo: string | null = null;
  const mp = report.mostPlayedGame;
  if (mp?.heroUrl) {
    mostPlayedHero = `assets/spotlight/${sanitizeId(mp.id)}-hero.${extFromSource(mp.heroUrl)}`;
    assets.push({ source: mp.heroUrl, relPath: mostPlayedHero });
  }
  if (mp?.logoUrl) {
    mostPlayedLogo = `assets/spotlight/${sanitizeId(mp.id)}-logo.${extFromSource(mp.logoUrl)}`;
    assets.push({ source: mp.logoUrl, relPath: mostPlayedLogo });
  }

  return {
    assets,
    relPathFor: (id: string) => relPaths.get(id) ?? null,
    mostPlayedHero,
    mostPlayedLogo,
  };
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const NEXUS_URL = "https://www.nexusgamelauncher.com";

export interface BuildHtmlArgs {
  report: WrappedReport;
  completedGames: Game[];
  /** Every game with recorded play time, for the full all-games breakdown. */
  playedGames?: Game[];
  relPathFor: (gameId: string) => string | null;
  periodLabel: string;
  generatedAt: string;
  title?: string;
  appVersion?: string;
  mostPlayedHero?: string | null;
  mostPlayedLogo?: string | null;
  cpuName?: string | null;
  gpuName?: string | null;
}

/** Builds the complete, self-contained HTML document (sans packaged images). */
export function buildStatsHtml(args: BuildHtmlArgs): string {
  const {
    report,
    completedGames,
    playedGames = [],
    relPathFor,
    periodLabel,
    generatedAt,
    title = "My Gaming Stats",
    appVersion,
    mostPlayedHero = null,
    mostPlayedLogo = null,
    cpuName = null,
    gpuName = null,
  } = args;

  const completed = [...completedGames].sort(
    (a, b) => b.totalPlayTimeS - a.totalPlayTimeS,
  );

  const longestSessionValue = report.longestSession
    ? formatPlayTime(report.longestSession.durationS)
    : "—";
  const longestSessionSub = report.longestSession
    ? esc(report.longestSession.gameName)
    : "";

  const kpis: { label: string; value: string; sub?: string }[] = [
    { label: "Play Time", value: formatPlayTime(report.totalPlayTimeS) },
    { label: "Sessions", value: fmtNum(report.totalSessions) },
    { label: "Games Played", value: fmtNum(report.totalGamesPlayed) },
    { label: "In Library", value: fmtNum(report.totalGamesInLibrary) },
    { label: "Longest Streak", value: fmtNum(report.longestStreakDays), sub: "days" },
    { label: "Longest Session", value: longestSessionValue, sub: longestSessionSub },
  ];

  const generatedLabel = formatDateTimeLabel(generatedAt);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>${STYLES}</style>
</head>
<body>
<div class="bg-mesh" aria-hidden="true"></div>
<div class="bg-grid" aria-hidden="true"></div>
<main class="wrap">
  <header class="hero">
    <span class="eyebrow">Nexus · Library Stats</span>
    <h1 class="hero-title">${esc(title)}</h1>
    <div class="hero-meta">
      <span class="pill pill-accent">${esc(periodLabel)}</span>
      ${report.mostPlayedGenre ? `<span class="pill">${esc(report.mostPlayedGenre)}</span>` : ""}
    </div>
    ${report.moodTagline ? `<p class="hero-tagline">${esc(report.moodTagline)}</p>` : ""}
  </header>

  <section class="kpis" aria-label="Summary">
    ${kpis
      .map(
        (k) => `<div class="kpi">
      <div class="kpi-value">${k.value}${k.sub && k.label !== "Longest Session" ? `<span class="kpi-unit">${esc(k.sub)}</span>` : ""}</div>
      <div class="kpi-label">${esc(k.label)}</div>
      ${k.label === "Longest Session" && k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ""}
    </div>`,
      )
      .join("\n    ")}
  </section>

  ${renderMostPlayed(report, relPathFor, mostPlayedHero, mostPlayedLogo)}

  ${renderTopGames(report, relPathFor)}

  ${renderCompleted(completed, relPathFor)}

  ${renderBreakdowns(report)}

  ${renderActivity(report)}

  ${renderFunFacts(report)}

  ${renderAllGames(playedGames)}

  <section class="cta">
    <div class="cta-glow" aria-hidden="true"></div>
    <div class="cta-body">
      <span class="cta-eyebrow">All your games. One place.</span>
      <h2 class="cta-title">Track yours with Nexus</h2>
      <p class="cta-sub">Unify Steam, Epic, GOG, Battle.net &amp; more into one local-first launcher with play-time tracking, stats, and shareable wraps like this one.</p>
    </div>
    <a class="cta-btn" href="${NEXUS_URL}" target="_blank" rel="noopener noreferrer">Get Nexus
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>
    </a>
  </section>

  <footer class="foot">
    <div class="foot-brand"><span class="foot-dot"></span>Nexus${appVersion ? ` v${esc(appVersion)}` : ""}</div>
    ${renderFootHardware(cpuName, gpuName)}
    <div class="foot-meta">
      <span><a class="foot-link" href="${NEXUS_URL}" target="_blank" rel="noopener noreferrer">nexusgamelauncher.com</a> · Generated ${esc(generatedLabel)}</span>
      <span>Exported from your local library — your data never left your machine.</span>
    </div>
  </footer>
</main>
</body>
</html>`;
}

function renderFootHardware(
  cpuName?: string | null,
  gpuName?: string | null,
): string {
  const chips: string[] = [];
  if (cpuName) {
    chips.push(
      `<span class="hw-chip"><span class="hw-key">CPU</span>${esc(cpuName)}</span>`,
    );
  }
  if (gpuName) {
    chips.push(
      `<span class="hw-chip"><span class="hw-key">GPU</span>${esc(gpuName)}</span>`,
    );
  }
  if (chips.length === 0) return "";
  return `<div class="foot-hw">${chips.join("")}</div>`;
}

function sectionHeader(label: string, title: string, count?: number): string {
  return `<div class="section-head">
      <span class="section-label">${esc(label)}</span>
      <h2 class="section-title">${esc(title)}${count !== undefined ? ` <span class="count">${count}</span>` : ""}</h2>
    </div>`;
}

function renderMostPlayed(
  report: WrappedReport,
  relPathFor: (id: string) => string | null,
  heroRel: string | null,
  logoRel: string | null,
): string {
  const g = report.mostPlayedGame;
  if (!g) return "";

  const bgStyle = heroRel
    ? `background-image:url('${esc(heroRel)}')`
    : nameGradient(g.name);

  const titleBlock = logoRel
    ? `<img class="feature-logo" src="${esc(logoRel)}" alt="${esc(g.name)}" />`
    : `<h3 class="feature-name">${esc(g.name)}</h3>`;

  return `<section class="section">
    ${sectionHeader("Spotlight", "Most Played")}
    <div class="feature surface-card${heroRel ? " has-hero" : ""}">
      <div class="feature-bg" style="${bgStyle}"></div>
      <div class="feature-shade"></div>
      <div class="feature-content">
        ${coverTile(g.id, g.name, relPathFor)}
        <div class="feature-meta">
          <span class="feature-rank">★ Most Played · ${esc(g.source)}</span>
          ${titleBlock}
          <div class="feature-stats">
            <span class="stat-chip"><b>${formatPlayTime(g.playTimeS)}</b>played</span>
            <span class="stat-chip"><b>${fmtNum(g.sessionCount)}</b>sessions</span>
          </div>
          ${report.genreTagline ? `<p class="feature-tagline">${esc(report.genreTagline)}</p>` : ""}
        </div>
      </div>
    </div>
  </section>`;
}

function renderTopGames(
  report: WrappedReport,
  relPathFor: (id: string) => string | null,
): string {
  const games = report.topGames ?? [];
  if (games.length === 0) return "";
  return `<section class="section">
    ${sectionHeader("Ranked by play time", "Top Games")}
    <div class="grid">
      ${games
        .map(
          (g, i) => `<div class="card">
        ${coverTile(g.id, g.name, relPathFor, i + 1)}
        <div class="card-name" title="${esc(g.name)}">${esc(g.name)}</div>
        <div class="card-sub">${formatPlayTime(g.playTimeS)} · ${fmtNum(g.sessionCount)} sessions</div>
      </div>`,
        )
        .join("\n      ")}
    </div>
  </section>`;
}

/**
 * Completion percentage for a game: an explicit `completed` flag wins (100%),
 * then a manual `progress` value, then a derived ratio of completed milestones.
 * Returns null when no completion signal is available.
 */
function completionPercent(g: Game): number | null {
  if (g.completed) return 100;
  if (typeof g.progress === "number" && g.progress > 0) {
    return Math.min(100, Math.max(0, Math.round(g.progress)));
  }
  if (g.milestonesJson) {
    try {
      const ms = JSON.parse(g.milestonesJson) as { completed?: boolean }[];
      if (Array.isArray(ms) && ms.length > 0) {
        const done = ms.filter((m) => m?.completed).length;
        return Math.round((done / ms.length) * 100);
      }
    } catch {
      /* malformed milestone JSON — treat as no data */
    }
  }
  return null;
}

function renderAllGames(games: Game[]): string {
  const played = games
    .filter((g) => g.totalPlayTimeS > 0)
    .sort((a, b) => b.totalPlayTimeS - a.totalPlayTimeS);
  if (played.length === 0) return "";

  const max = played[0].totalPlayTimeS || 1;
  const rows = played
    .map((g, i) => {
      const pct = Math.max(2, Math.round((g.totalPlayTimeS / max) * 100));
      const comp = completionPercent(g);
      const compHtml =
        comp !== null
          ? `<span class="bd-comp${comp >= 100 ? " done" : ""}">${comp}%</span>`
          : `<span class="bd-comp empty" title="No progress data">—</span>`;
      return `<div class="bd-row">
        <span class="bd-rank">${i + 1}</span>
        <div class="bd-body">
          <div class="bd-head">
            <span class="bd-name" title="${esc(g.name)}">${esc(g.name)}</span>
            <span class="bd-time">${formatPlayTime(g.totalPlayTimeS)}</span>
          </div>
          <div class="bd-track"><div class="bd-fill" style="width:${pct}%"></div></div>
        </div>
        ${compHtml}
      </div>`;
    })
    .join("\n      ");

  return `<section class="section">
    ${sectionHeader("Complete breakdown", "All Games", played.length)}
    <div class="surface-card panel">
      <div class="bd-legend"><span>Ranked by total play time</span><span>Completed</span></div>
      <div class="bd-list">
      ${rows}
      </div>
    </div>
  </section>`;
}

function renderBreakdowns(report: WrappedReport): string {
  const genres = (report.genreBreakdown ?? []).slice(0, 8);
  const platforms = report.platformBreakdown ?? [];
  if (genres.length === 0 && platforms.length === 0) return "";

  const genreBars = genres
    .map((g) => barRow(g.name, g.percent, formatPlayTime(g.playTimeS)))
    .join("\n      ");
  const platformBars = platforms
    .map((p) => barRow(p.source, p.percent, formatPlayTime(p.playTimeS)))
    .join("\n      ");

  return `<section class="section two-col">
    ${
      genres.length
        ? `<div class="surface-card panel">
      ${sectionHeader("Breakdown", "Genres")}
      <div class="bars">
      ${genreBars}
      </div>
    </div>`
        : ""
    }
    ${
      platforms.length
        ? `<div class="surface-card panel">
      ${sectionHeader("Breakdown", "Platforms")}
      <div class="bars">
      ${platformBars}
      </div>
    </div>`
        : ""
    }
  </section>`;
}

function renderActivity(report: WrappedReport): string {
  const days = report.playTimeByDayOfWeek ?? [];
  const hours = report.playTimeByHourOfDay ?? [];
  const hasDays = days.some((d) => d.playTimeS > 0);
  const hasHours = hours.some((h) => h.playTimeS > 0);
  if (!hasDays && !hasHours) return "";

  const dayMax = Math.max(1, ...days.map((d) => d.playTimeS));
  const hourMax = Math.max(1, ...hours.map((h) => h.playTimeS));

  const dayCols = days
    .map(
      (d) =>
        `<div class="vcol"><div class="vbar" style="height:${pct(d.playTimeS, dayMax)}%"></div><span>${esc(DAY_LABELS[d.day] ?? String(d.day))}</span></div>`,
    )
    .join("");
  const hourCols = hours
    .map(
      (h) =>
        `<div class="vcol"><div class="vbar" style="height:${pct(h.playTimeS, hourMax)}%"></div><span>${h.hour % 6 === 0 ? h.hour : ""}</span></div>`,
    )
    .join("");

  return `<section class="section">
    ${sectionHeader("Patterns", "When You Play")}
    <div class="charts">
      ${hasDays ? `<div class="surface-card chart"><div class="chart-title">By day of week</div><div class="vbars">${dayCols}</div></div>` : ""}
      ${hasHours ? `<div class="surface-card chart"><div class="chart-title">By hour of day</div><div class="vbars hours">${hourCols}</div></div>` : ""}
    </div>
  </section>`;
}

function renderFunFacts(report: WrappedReport): string {
  const facts = report.funFacts ?? [];
  const trivia = report.trivia ?? [];
  if (facts.length === 0 && trivia.length === 0) return "";
  const items = [...facts.map((f) => f.label), ...trivia].filter(Boolean);
  if (items.length === 0) return "";
  return `<section class="section">
    ${sectionHeader("Did you know", "Fun Facts")}
    <ul class="facts">
      ${items.map((t) => `<li><span class="facts-check"></span><span>${esc(t)}</span></li>`).join("\n      ")}
    </ul>
  </section>`;
}

function renderCompleted(
  completed: Game[],
  relPathFor: (id: string) => string | null,
): string {
  return `<section class="section">
    ${sectionHeader("Every finished game", "Completed", completed.length)}
    ${
      completed.length === 0
        ? `<p class="muted">No completed games yet.</p>`
        : `<div class="grid">
      ${completed
        .map(
          (g) => `<div class="card">
        ${coverTile(g.id, g.name, relPathFor)}
        <div class="status-badge">Completed</div>
        <div class="card-name" title="${esc(g.name)}">${esc(g.name)}</div>
        <div class="card-sub">${formatPlayTime(g.totalPlayTimeS)}${g.lastPlayedAt ? ` · ${esc(formatDateLabel(g.lastPlayedAt.slice(0, 10)))}` : ""}</div>
      </div>`,
        )
        .join("\n      ")}
    </div>`
    }
  </section>`;
}

/** A cover tile: gradient background with the cover image layered on top. */
function coverTile(
  gameId: string,
  name: string,
  relPathFor: (id: string) => string | null,
  rank?: number,
): string {
  const rel = relPathFor(gameId);
  const grad = nameGradient(name);
  const initial = esc((name.trim()[0] ?? "?").toUpperCase());
  const img = rel
    ? `<img src="${esc(rel)}" alt="${esc(name)}" loading="lazy" />`
    : `<span class="cover-initial">${initial}</span>`;
  const badge = rank ? `<span class="cover-rank">${rank}</span>` : "";
  return `<div class="cover" style="background:${grad}">${img}${badge}</div>`;
}

// ---------------------------------------------------------------------------
// JSON builder
// ---------------------------------------------------------------------------

export interface JsonHardware {
  cpu: string | null;
  gpu: string | null;
}

export interface BuildJsonArgs {
  report: WrappedReport;
  completedGames: Game[];
  /** Every game with recorded play time, mirroring the HTML "All Games" list. */
  playedGames?: Game[];
  hardware?: JsonHardware | null;
  period: ResolvedExportPeriod;
  generatedAt: string;
  appVersion?: string;
}

/** Builds the versioned, data-only JSON document (pretty-printed). */
export function buildStatsJson(args: BuildJsonArgs): string {
  const {
    report,
    completedGames,
    playedGames = [],
    hardware = null,
    period,
    generatedAt,
    appVersion,
  } = args;
  const completed = [...completedGames].sort(
    (a, b) => b.totalPlayTimeS - a.totalPlayTimeS,
  );
  const played = playedGames
    .filter((g) => g.totalPlayTimeS > 0)
    .sort((a, b) => b.totalPlayTimeS - a.totalPlayTimeS);

  const doc = {
    schemaVersion: 2,
    generatedAt,
    app: { name: "Nexus", version: appVersion ?? null },
    hardware: hardware
      ? { cpu: hardware.cpu ?? null, gpu: hardware.gpu ?? null }
      : null,
    period: {
      type: period.type,
      startDate: period.startDate,
      endDate: period.endDate,
      label: period.label,
    },
    report,
    completed: {
      count: completed.length,
      games: completed.map((g) => ({
        id: g.id,
        name: g.name,
        source: g.source,
        coverUrl: g.customCover ?? g.coverUrl,
        heroUrl: g.customHero ?? g.heroUrl,
        totalPlayTimeS: g.totalPlayTimeS,
        playCount: g.playCount,
        lastPlayed: g.lastPlayedAt,
        rating: g.rating,
        status: g.status,
        addedAt: g.addedAt,
      })),
    },
    playedGames: {
      count: played.length,
      games: played.map((g) => ({
        id: g.id,
        name: g.name,
        source: g.source,
        totalPlayTimeS: g.totalPlayTimeS,
        playCount: g.playCount,
        lastPlayed: g.lastPlayedAt,
        status: g.status,
        rating: g.rating,
        completionPercent: completionPercent(g),
      })),
    },
  };

  return JSON.stringify(doc, null, 2);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtNum(n: number): string {
  return new Intl.NumberFormat("en-US").format(n ?? 0);
}

function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / max) * 100)));
}

function barRow(label: string, percent: number, valueLabel: string): string {
  const width = Math.max(2, Math.min(100, Math.round(percent)));
  return `<div class="bar-row">
        <div class="bar-head"><span class="bar-label">${esc(label)}</span><span class="bar-val">${esc(valueLabel)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      </div>`;
}

/** Stable per-name gradient so tiles without art still look intentional. */
function nameGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  const h1 = hash % 360;
  const h2 = (h1 + 48) % 360;
  return `linear-gradient(135deg, hsl(${h1} 45% 28%), hsl(${h2} 50% 18%))`;
}

function extFromSource(source: string): string {
  const clean = source.split("?")[0].split("#")[0];
  const match = /\.(jpe?g|png|webp|gif|avif)$/i.exec(clean);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Formats `YYYY-MM-DD` as e.g. `Jun 15, 2026`. Falls back to the raw value. */
function formatDateLabel(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  if (!m) return dateStr;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  const day = Number(m[3]);
  if (month < 0 || month > 11) return dateStr;
  return `${MONTHS[month]} ${day}, ${year}`;
}

function formatDateTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ---------------------------------------------------------------------------
// Inlined Obsidian-theme styles (system font stack, no external requests)
// ---------------------------------------------------------------------------

const STYLES = `
:root{
  --background:#07070D; --background-2:#0A0A12; --surface:#11111A; --surface-raised:#1A1A26;
  --border:#25252F; --border-strong:#34343F;
  --foreground:#F2F2F2; --muted:#8B8B9E; --disabled:#52525E;
  --primary:#7600DA; --cyan:#00D4FF; --magenta:#FF3DCB; --success:#4ADE80;
  --gradient:linear-gradient(135deg,#7600DA 0%,#4A1FE0 50%,#00D4FF 100%);
  --gradient-soft:linear-gradient(135deg,hsla(272,100%,43%,.25) 0%,hsla(192,100%,50%,.18) 100%);
  --radius-md:6px; --radius-lg:8px; --radius-xl:12px; --radius-2xl:16px; --radius-full:9999px;
  --mono:"Geist Mono","Cascadia Code","Consolas",ui-monospace,monospace;
}
*,*::before,*::after{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{
  position:relative;
  background:var(--background); color:var(--foreground);
  font-family:"Geist Sans","Segoe UI",system-ui,-apple-system,sans-serif;
  font-variant-numeric:tabular-nums; line-height:1.5;
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  overflow-x:hidden;
}
.bg-mesh{
  position:fixed; inset:-10%; z-index:-2; pointer-events:none;
  background:
    radial-gradient(ellipse 60% 50% at 18% 12%, hsla(272,100%,43%,.32), transparent 60%),
    radial-gradient(ellipse 50% 45% at 88% 8%, hsla(192,100%,50%,.20), transparent 60%),
    radial-gradient(ellipse 55% 50% at 60% 0%, hsla(285,100%,60%,.16), transparent 65%);
  filter:blur(40px) saturate(120%);
}
.bg-grid{
  position:fixed; inset:0; z-index:-1; pointer-events:none;
  background-image:
    linear-gradient(hsla(0,0%,100%,.025) 1px, transparent 1px),
    linear-gradient(90deg, hsla(0,0%,100%,.025) 1px, transparent 1px);
  background-size:56px 56px;
  -webkit-mask-image:radial-gradient(ellipse 80% 55% at 50% 0%, black 25%, transparent 75%);
  mask-image:radial-gradient(ellipse 80% 55% at 50% 0%, black 25%, transparent 75%);
}
.wrap{max-width:1080px;margin:0 auto;padding:72px 24px 80px;}

/* Hero */
.hero{text-align:center;display:flex;flex-direction:column;align-items:center;margin-bottom:56px;}
.eyebrow{
  display:inline-flex;align-items:center;gap:8px;
  font-family:var(--mono);font-size:12px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;
  color:var(--muted);margin-bottom:20px;
}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--gradient);}
.hero-title{
  margin:0;font-size:clamp(40px,8vw,72px);font-weight:700;line-height:1.15;letter-spacing:-.03em;
  padding-bottom:.12em;
  background:var(--gradient);-webkit-background-clip:text;background-clip:text;
  color:transparent;-webkit-text-fill-color:transparent;
}
.hero-meta{margin-top:20px;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;}
.pill{
  display:inline-flex;align-items:center;gap:8px;padding:6px 16px;border-radius:var(--radius-full);
  background:hsla(240,30%,8%,.55);border:1px solid var(--border);
  font-family:var(--mono);font-size:12px;letter-spacing:.02em;color:var(--muted);
}
.pill-accent{color:var(--cyan);background:hsla(192,100%,50%,.08);border-color:hsla(192,100%,50%,.25);}
.hero-tagline{max-width:600px;margin:20px auto 0;color:var(--muted);font-size:17px;}

/* KPIs */
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-bottom:64px;}
.kpi{position:relative;overflow:hidden;padding:26px 28px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);}
.kpi::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:var(--gradient);opacity:.6;}
.kpi-value{
  font-family:var(--mono);font-size:clamp(26px,2.6vw,34px);font-weight:600;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;
  background:var(--gradient);-webkit-background-clip:text;background-clip:text;
  color:transparent;-webkit-text-fill-color:transparent;
}
.kpi-unit{font-size:14px;margin-left:4px;-webkit-text-fill-color:var(--muted);color:var(--muted);}
.kpi-label{margin-top:8px;font-family:var(--mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);}
.kpi-sub{margin-top:4px;font-size:12px;color:var(--disabled);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}

/* Sections */
.section{margin-bottom:64px;}
.section-head{margin-bottom:24px;}
.section-label{display:block;color:var(--primary);font-weight:600;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;}
.section-title{margin:0;font-size:clamp(22px,3vw,30px);font-weight:700;letter-spacing:-.02em;display:flex;align-items:center;gap:12px;}
.count{font-family:var(--mono);background:hsla(192,100%,50%,.08);border:1px solid hsla(192,100%,50%,.25);color:var(--cyan);border-radius:var(--radius-full);padding:2px 12px;font-size:14px;font-weight:600;letter-spacing:0;}
.surface-card{background:linear-gradient(180deg,var(--surface) 0%,var(--surface-raised) 100%);border:1px solid var(--border);border-radius:var(--radius-2xl);}
.panel{padding:28px;}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:24px;}

/* Cards */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(156px,1fr));gap:18px;}
.card{position:relative;}
.cover{position:relative;aspect-ratio:2/3;border-radius:var(--radius-lg);overflow:hidden;border:1px solid var(--border);box-shadow:0 8px 24px hsla(0,0%,0%,.35);display:flex;align-items:center;justify-content:center;}
.cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}
.cover-initial{font-family:var(--mono);font-size:34px;font-weight:600;color:hsla(0,0%,100%,.6);}
.cover-rank{position:absolute;top:8px;left:8px;min-width:22px;height:22px;padding:0 6px;display:inline-flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:12px;font-weight:600;color:#fff;background:var(--gradient);border-radius:var(--radius-full);box-shadow:0 4px 12px hsla(272,100%,43%,.45);}
.card-name{margin-top:10px;font-size:14px;font-weight:600;letter-spacing:-.005em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.card-sub{margin-top:3px;color:var(--muted);font-size:12px;font-family:var(--mono);}
.status-badge{position:absolute;top:8px;left:8px;display:inline-flex;align-items:center;gap:6px;background:hsla(142,71%,45%,.16);border:1px solid hsla(142,71%,45%,.35);color:var(--success);font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:var(--radius-full);}
.status-badge::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--success);box-shadow:0 0 8px var(--success);}

/* Feature (most played) */
.feature{position:relative;overflow:hidden;padding:0;min-height:320px;isolation:isolate;}
.feature-bg{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center 30%;transform:scale(1.06);filter:saturate(118%) contrast(104%);}
.feature.has-hero .feature-bg{animation:feature-zoom 24s ease-in-out infinite alternate;}
@keyframes feature-zoom{from{transform:scale(1.06)}to{transform:scale(1.14)}}
.feature-shade{position:absolute;inset:0;z-index:1;background:
  linear-gradient(90deg,hsl(240 24% 5% / .97) 0%,hsl(240 24% 5% / .9) 32%,hsl(240 24% 5% / .55) 62%,hsl(240 24% 5% / .25) 100%),
  linear-gradient(0deg,hsl(240 24% 5% / .85) 0%,transparent 55%),
  radial-gradient(120% 80% at 100% 0%,hsla(272,100%,43%,.18),transparent 60%);}
.feature-content{position:relative;z-index:2;display:flex;gap:32px;align-items:center;padding:36px;min-height:320px;}
.feature .cover{width:156px;flex:0 0 156px;box-shadow:0 22px 50px hsla(0,0%,0%,.65),0 0 0 1px hsla(0,0%,100%,.06);}
.feature-meta{min-width:0;flex:1;}
.feature-rank{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--cyan);background:hsla(192,100%,50%,.08);border:1px solid hsla(192,100%,50%,.28);border-radius:var(--radius-full);padding:5px 12px;margin-bottom:16px;}
.feature-name{margin:0;font-size:clamp(28px,4.5vw,46px);font-weight:700;letter-spacing:-.025em;line-height:1.1;text-shadow:0 2px 24px hsla(0,0%,0%,.6);}
.feature-logo{display:block;max-width:min(420px,80%);max-height:120px;width:auto;height:auto;object-fit:contain;filter:drop-shadow(0 6px 28px hsla(0,0%,0%,.7));}
.feature-stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;}
.feature-tagline{color:var(--foreground);opacity:.82;margin:18px 0 0;font-size:15px;max-width:46ch;}
.stat-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 13px;border-radius:var(--radius-full);background:hsla(0,0%,100%,.05);border:1px solid hsla(0,0%,100%,.12);backdrop-filter:blur(8px);font-size:13px;color:var(--muted);}
.stat-chip b{font-family:var(--mono);color:var(--foreground);font-weight:600;}
.stat-chip.src{text-transform:capitalize;color:var(--cyan);border-color:hsla(192,100%,50%,.3);background:hsla(192,100%,50%,.08);}
.muted{color:var(--muted);margin:14px 0 0;}

/* Bars */
.bars{display:flex;flex-direction:column;gap:16px;margin-top:4px;}
.bar-row .bar-head{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;margin-bottom:7px;}
.bar-label{font-weight:500;text-transform:capitalize;}
.bar-val{font-family:var(--mono);font-size:12px;color:var(--muted);}
.bar-track{height:8px;background:var(--background);border:1px solid var(--border);border-radius:var(--radius-full);overflow:hidden;}
.bar-fill{height:100%;background:var(--gradient);border-radius:var(--radius-full);box-shadow:0 0 12px hsla(272,100%,43%,.35);}

/* All-games breakdown */
.bd-legend{display:flex;justify-content:space-between;font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding-bottom:14px;margin-bottom:8px;border-bottom:1px solid var(--border);}
.bd-list{display:flex;flex-direction:column;}
.bd-row{display:flex;align-items:center;gap:16px;padding:13px 0;border-bottom:1px solid hsla(0,0%,100%,.04);}
.bd-row:last-child{border-bottom:none;}
.bd-rank{flex:0 0 26px;text-align:center;font-family:var(--mono);font-size:12px;color:var(--disabled);}
.bd-body{flex:1;min-width:0;}
.bd-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px;}
.bd-name{font-size:14px;font-weight:500;letter-spacing:-.005em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bd-time{flex-shrink:0;font-family:var(--mono);font-size:12px;color:var(--muted);}
.bd-track{height:6px;background:var(--background);border:1px solid var(--border);border-radius:var(--radius-full);overflow:hidden;}
.bd-fill{height:100%;background:var(--gradient);border-radius:var(--radius-full);}
.bd-comp{flex:0 0 50px;text-align:right;font-family:var(--mono);font-size:13px;font-weight:600;color:var(--cyan);}
.bd-comp.done{color:var(--success);}
.bd-comp.empty{color:var(--disabled);font-weight:400;}

/* Charts */
.charts{display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.chart{padding:24px;}
.chart-title{font-family:var(--mono);color:var(--muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:18px;}
.vbars{display:flex;align-items:flex-end;gap:8px;height:130px;}
.vbars.hours{gap:3px;}
.vcol{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;gap:8px;}
.vbar{width:100%;min-height:3px;background:var(--gradient);border-radius:4px 4px 0 0;}
.vcol span{font-family:var(--mono);font-size:10px;color:var(--muted);}

/* Facts */
.facts{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:repeat(2,1fr);gap:12px;}
.facts li{display:flex;align-items:flex-start;gap:12px;padding:16px;background:hsla(0,0%,100%,.02);border:1px solid var(--border);border-radius:var(--radius-lg);font-size:14px;color:var(--foreground);line-height:1.5;}
.facts-check{flex-shrink:0;width:18px;height:18px;margin-top:1px;border-radius:50%;background:var(--gradient-soft);border:1px solid hsla(272,100%,43%,.4);background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%2300D4FF' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 6 9 17 4 12'/></svg>");background-repeat:no-repeat;background-position:center;}

/* CTA strip */
.cta{position:relative;overflow:hidden;margin:8px 0 40px;padding:40px 44px;display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:space-between;background:linear-gradient(135deg,hsla(272,100%,43%,.16),hsla(192,100%,50%,.08));border:1px solid hsla(272,100%,43%,.32);border-radius:var(--radius-2xl);}
.cta-glow{position:absolute;inset:0;z-index:0;background:radial-gradient(80% 140% at 100% 0%,hsla(192,100%,50%,.22),transparent 60%),radial-gradient(70% 120% at 0% 100%,hsla(272,100%,43%,.22),transparent 60%);pointer-events:none;}
.cta-body{position:relative;z-index:1;min-width:0;max-width:62ch;}
.cta-eyebrow{display:block;font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--cyan);margin-bottom:10px;}
.cta-title{margin:0;font-size:clamp(24px,3.4vw,32px);font-weight:700;letter-spacing:-.02em;background:var(--gradient);-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent;line-height:1.15;padding-bottom:.08em;}
.cta-sub{margin:12px 0 0;color:var(--muted);font-size:15px;line-height:1.55;}
.cta-btn{position:relative;z-index:1;flex-shrink:0;display:inline-flex;align-items:center;gap:9px;padding:14px 26px;border-radius:var(--radius-full);background:var(--gradient);color:#fff;font-weight:600;font-size:15px;text-decoration:none;box-shadow:0 10px 30px hsla(272,100%,43%,.4);white-space:nowrap;}
.cta-btn svg{transition:transform .2s ease;}
.cta-btn:hover svg{transform:translate(2px,-2px);}

/* Footer */
.foot{margin-top:24px;padding-top:28px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:16px;align-items:center;justify-content:space-between;}
.foot-brand{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);border:1px solid var(--border);border-radius:var(--radius-full);padding:6px 14px;}
.foot-dot{width:6px;height:6px;border-radius:50%;background:var(--cyan);box-shadow:0 0 8px var(--cyan);}
.foot-hw{display:flex;flex-wrap:wrap;gap:8px;}
.hw-chip{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);background:hsla(0,0%,100%,.03);border:1px solid var(--border);border-radius:var(--radius-full);padding:5px 12px;}
.hw-key{font-family:var(--mono);font-size:10px;font-weight:600;letter-spacing:.08em;color:var(--cyan);}
.foot-meta{display:flex;flex-direction:column;gap:4px;text-align:right;color:var(--muted);font-size:12px;}
.foot-link{color:var(--cyan);text-decoration:none;}
.foot-link:hover{text-decoration:underline;}

@media (max-width:760px){
  .kpis{grid-template-columns:repeat(2,1fr);gap:14px;}
  .two-col,.charts,.facts{grid-template-columns:1fr;}
  .feature-content{flex-direction:column;align-items:flex-start;gap:22px;padding:28px;}
  .feature .cover{width:128px;flex:0 0 128px;}
  .cta{padding:28px;}
  .foot{flex-direction:column;align-items:flex-start;}
  .foot-meta{text-align:left;}
}
`;
