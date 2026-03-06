import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import type { SessionDistribution, SessionScope } from "@/lib/tauri";
import type { GameSource } from "@/stores/gameStore";
import { formatPlayTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_ACCENT = "#3B82F6";

const ALL_SOURCES: GameSource[] = [
  "steam",
  "epic",
  "gog",
  "ubisoft",
  "battlenet",
  "xbox",
  "standalone",
];

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

// ── Sub-components ─────────────────────────────────────────────────────────

interface StatPillProps {
  label: string;
  value: string;
}

function StatPill({ label, value }: StatPillProps) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-card px-4 py-2"
      data-testid={`stat-pill-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      label: string;
      count: number;
      totalPlayTimeS: number;
      percentage: number;
    };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 px-3 py-2 text-xs",
        "backdrop-blur-md",
      )}
      style={{
        background: "hsla(240, 10%, 7%, 0.85)",
        minWidth: 180,
      }}
      data-testid="histogram-tooltip"
    >
      <p className="mb-1 font-semibold text-foreground">{d.label} sessions</p>
      <p className="text-muted-foreground">
        <span className="tabular-nums text-foreground">{d.count}</span>{" "}
        ({d.percentage.toFixed(1)}% of all sessions)
      </p>
      <p className="text-muted-foreground">
        Total:{" "}
        <span className="tabular-nums text-foreground">
          {formatPlayTime(d.totalPlayTimeS)}
        </span>
      </p>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function HistogramSkeleton() {
  return (
    <div data-testid="histogram-skeleton" className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-7 w-24 rounded-md bg-muted" />
          <div className="h-7 w-24 rounded-md bg-muted" />
        </div>
      </div>
      <div className="h-48 w-full rounded-lg bg-muted" />
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 flex-1 rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export interface SessionHistogramProps {
  /**
   * Pass data directly (used in tests). When omitted, the component fetches
   * via the `useSessionDistribution` hook.
   */
  distribution?: SessionDistribution | null;
  isLoading?: boolean;
  /** Called when the user changes scope/source so the parent can re-fetch. */
  onScopeChange?: (scope: SessionScope) => void;
  /** Theme accent color (hex). */
  accentColor?: string;
  /** Available sources to show in the "By Source" filter. */
  availableSources?: GameSource[];
  /** Hide the header and scope toggle (e.g. when embedded in a per-game panel). */
  hideScope?: boolean;
}

export function SessionHistogram({
  distribution,
  isLoading = false,
  onScopeChange,
  accentColor = DEFAULT_ACCENT,
  availableSources = ALL_SOURCES,
  hideScope = false,
}: SessionHistogramProps) {
  const [scopeMode, setScopeMode] = React.useState<"all" | "source">("all");
  const [selectedSource, setSelectedSource] = React.useState<GameSource>(
    availableSources[0] ?? "steam",
  );

  // Notify parent when scope changes
  React.useEffect(() => {
    if (!onScopeChange) return;
    if (scopeMode === "all") {
      onScopeChange({ type: "library" });
    } else {
      onScopeChange({ type: "source", value: selectedSource });
    }
  }, [scopeMode, selectedSource, onScopeChange]);

  if (isLoading) return <HistogramSkeleton />;

  const isEmpty = !distribution || distribution.totalSessions === 0;

  // Build chart data
  const maxCount = distribution
    ? Math.max(...distribution.buckets.map((b) => b.count), 1)
    : 1;

  const chartData = distribution
    ? distribution.buckets.map((b) => ({
        label: b.label,
        count: b.count,
        totalPlayTimeS: b.totalPlayTimeS,
        percentage:
          distribution.totalSessions > 0
            ? (b.count / distribution.totalSessions) * 100
            : 0,
        isTallest: b.count === maxCount && b.count > 0,
        minS: b.minS,
        maxS: b.maxS,
      }))
    : [];

  const meanS = distribution?.meanDurationS ?? 0;
  const meanBucketLabel = distribution
    ? getMeanBucketLabel(chartData, meanS)
    : undefined;

  return (
    <div data-testid="session-histogram">
      {/* Header row (hidden when embedded in a per-game panel) */}
      {!hideScope && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">
              Session Lengths
            </h3>

            {/* Scope toggle */}
            <div
              className="flex items-center gap-1 rounded-lg border border-border bg-card p-1"
              role="group"
              aria-label="Histogram scope"
            >
              <button
                type="button"
                data-testid="scope-toggle-all"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  scopeMode === "all"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setScopeMode("all")}
              >
                All Games
              </button>
              <button
                type="button"
                data-testid="scope-toggle-source"
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  scopeMode === "source"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setScopeMode("source")}
              >
                By Source
              </button>
            </div>
          </div>

          {/* Source filter pills (visible only in "By Source" mode) */}
          {scopeMode === "source" && (
            <div
              className="mb-4 flex flex-wrap gap-2"
              data-testid="source-filter-pills"
              role="group"
              aria-label="Source filter"
            >
              {availableSources.map((src) => (
                <button
                  key={src}
                  type="button"
                  data-testid={`source-pill-${src}`}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selectedSource === src
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                  )}
                  onClick={() => setSelectedSource(src)}
                >
                  {SOURCE_LABELS[src]}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Chart */}
      {isEmpty ? (
        <div
          data-testid="histogram-empty"
          className="flex h-48 items-center justify-center rounded-lg border border-border"
        >
          <p className="text-sm text-muted-foreground">
            No sessions recorded yet
          </p>
        </div>
      ) : (
        <div
          style={{ width: "100%", minWidth: 300, height: 200 }}
          aria-label="Session length distribution"
          role="img"
        >
          <ResponsiveContainer>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "hsl(240, 5%, 55%)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(240, 5%, 55%)" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={30}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
              {/* Mean reference line — visual hint at the mean bucket */}
              {meanS > 0 && meanBucketLabel && (
                <ReferenceLine
                  x={meanBucketLabel}
                  stroke={accentColor}
                  strokeDasharray="4 4"
                  strokeOpacity={0.5}
                />
              )}
              <Bar
                dataKey="count"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={accentColor}
                    fillOpacity={entry.isTallest ? 1 : 0.6}
                    aria-label={`${entry.label}: ${entry.count} sessions`}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Stats summary row */}
      {!isEmpty && distribution && (
        <div
          className="mt-4 flex flex-wrap gap-3"
          data-testid="histogram-stats-row"
        >
          <StatPill label="Mean" value={formatPlayTime(Math.round(distribution.meanDurationS))} />
          <StatPill label="Median" value={formatPlayTime(Math.round(distribution.medianDurationS))} />
          <StatPill label="75th pct" value={formatPlayTime(Math.round(distribution.p75DurationS))} />
          <StatPill
            label="Longest"
            value={formatPlayTime(distribution.longestSessionS)}
          />
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Find the bucket label whose range contains `meanS`.
 * Falls back to the last bucket label if meanS exceeds all boundaries.
 */
function getMeanBucketLabel(
  chartData: Array<{ label: string; minS: number; maxS: number | null }>,
  meanS: number,
): string | undefined {
  for (const b of chartData) {
    const inBucket =
      b.maxS !== null ? meanS >= b.minS && meanS < b.maxS : meanS >= b.minS;
    if (inBucket) return b.label;
  }
  return chartData[chartData.length - 1]?.label;
}
