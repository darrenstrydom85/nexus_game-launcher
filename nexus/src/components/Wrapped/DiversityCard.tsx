import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Sparkles } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";

interface DiversityCardProps {
  report: WrappedReport;
}

const PLATFORM_COLORS = [
  "var(--primary)",
  "hsl(280 70% 60%)",
  "hsl(160 60% 50%)",
  "hsl(40 80% 55%)",
  "hsl(10 70% 55%)",
];

export function DiversityCard({ report }: DiversityCardProps) {
  const platformData = report.platformBreakdown.map((p) => ({
    name: p.source.charAt(0).toUpperCase() + p.source.slice(1),
    percent: parseFloat(p.percent.toFixed(1)),
  }));

  return (
    <div
      data-testid="diversity-card"
      className="flex h-full flex-col justify-center gap-6 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Diversity
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          Your gaming world
        </h2>
      </div>

      {/* Games discovered */}
      {report.newTitlesInPeriod > 0 && (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Games Discovered
            </p>
            <p className="mt-0.5 text-base font-semibold text-foreground">
              {report.newTitlesInPeriod} new title
              {report.newTitlesInPeriod !== 1 ? "s" : ""} played for the first
              time
            </p>
          </div>
        </div>
      )}

      {/* Platform mix */}
      {platformData.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Platform Mix (% of play time)
          </p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={platformData}
                layout="vertical"
                margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${v}%`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fill: "var(--foreground)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    color: "var(--foreground)",
                    fontSize: "12px",
                  }}
                  formatter={(v: number | undefined) => [`${v ?? 0}%`, "Share"]}
                />
                <Bar dataKey="percent" radius={[0, 4, 4, 0]}>
                  {platformData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={PLATFORM_COLORS[i % PLATFORM_COLORS.length]}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
