import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { formatPlayTime } from "@/lib/utils";
import type { WrappedReport } from "@/types/wrapped";

interface HeroCardProps {
  report: WrappedReport;
}

const MAX_HOURS = 500;

export function HeroCard({ report }: HeroCardProps) {
  const totalHours = report.totalPlayTimeS / 3600;
  const filledPercent = Math.min(totalHours / MAX_HOURS, 1);
  const filled = filledPercent * 100;
  const empty = 100 - filled;

  const ringData = [
    { value: filled },
    { value: empty },
  ];

  const primaryFact = report.funFacts[0] ?? null;

  return (
    <div
      data-testid="hero-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-12"
    >
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        {report.periodLabel}
      </p>

      {/* Circular progress ring */}
      <div className="relative flex size-56 items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={ringData}
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius="72%"
              outerRadius="90%"
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill="var(--primary)" />
              <Cell fill="hsl(var(--muted) / 0.3)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-4xl font-bold tabular-nums text-foreground">
            {Math.floor(totalHours)}h
          </span>
          <span className="text-xs text-muted-foreground">played</span>
        </div>
      </div>

      {/* Headline */}
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground">
          You played{" "}
          <span className="text-primary">{formatPlayTime(report.totalPlayTimeS)}</span>
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">
          across{" "}
          <span className="font-semibold text-foreground">
            {report.totalGamesPlayed} game{report.totalGamesPlayed !== 1 ? "s" : ""}
          </span>{" "}
          in{" "}
          <span className="font-semibold text-foreground">
            {report.totalSessions} session{report.totalSessions !== 1 ? "s" : ""}
          </span>
        </p>
      </div>

      {/* Fun fact */}
      {primaryFact && (
        <p
          data-testid="hero-fun-fact"
          className="max-w-sm text-center text-base text-muted-foreground"
        >
          {primaryFact.label}
        </p>
      )}

      {/* Comparison */}
      {report.comparisonPreviousPeriod && (
        <div
          data-testid="hero-comparison"
          className="rounded-full border border-border bg-card/60 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm"
        >
          {report.comparisonPreviousPeriod.label}
        </div>
      )}
    </div>
  );
}
