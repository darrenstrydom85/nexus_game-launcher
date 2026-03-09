import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";
import type { WrappedReport } from "@/types/wrapped";

interface GenreCardProps {
  report: WrappedReport;
}

const GENRE_COLORS = [
  "var(--primary)",
  "hsl(280 70% 60%)",
  "hsl(160 60% 50%)",
  "hsl(40 80% 55%)",
  "hsl(10 70% 55%)",
  "hsl(200 60% 55%)",
  "hsl(320 60% 55%)",
  "hsl(100 50% 50%)",
];

export function GenreCard({ report }: GenreCardProps) {
  const genres = report.genreBreakdown.slice(0, 8);

  if (genres.length === 0) {
    return (
      <div
        data-testid="genre-card"
        className="flex h-full flex-col items-center justify-center gap-4 px-8"
      >
        <p className="text-muted-foreground">No genre data available.</p>
      </div>
    );
  }

  const chartData = genres.map((g) => ({
    name: g.name,
    value: g.playTimeS,
    pct: g.percent,
  }));

  return (
    <div
      data-testid="genre-card"
      className="flex h-full flex-col items-center justify-center gap-6 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Genre Breakdown
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          What you played
        </h2>
        {report.genreTagline && (
          <p
            data-testid="genre-tagline"
            className="mt-2 text-base text-muted-foreground"
          >
            {report.genreTagline}
          </p>
        )}
      </div>

      <div className="h-64 w-full max-w-sm">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              outerRadius="80%"
              dataKey="value"
              strokeWidth={0}
              label={(props: PieLabelRenderProps) => {
                const pct = (props.payload as { pct?: number })?.pct ?? 0;
                return `${props.name} ${Math.round(pct)}%`;
              }}
              labelLine={false}
            >
              {chartData.map((_, i) => (
                <Cell
                  key={i}
                  fill={GENRE_COLORS[i % GENRE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              itemStyle={{ color: "var(--foreground)" }}
              labelStyle={{ color: "var(--foreground)" }}
              formatter={(value: number | undefined, name: string | undefined) => [
                `${Math.round((value ?? 0) / 3600)}h`,
                name ?? "",
              ]}
            />
            <Legend
              formatter={(value) => (
                <span style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
