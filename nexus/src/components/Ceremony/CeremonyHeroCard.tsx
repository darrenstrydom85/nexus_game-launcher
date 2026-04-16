import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { CheckCircle2, MoonStar } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonyHeroCardProps {
  data: GameCeremonyData;
}

const MAX_HOURS = 200;

export function CeremonyHeroCard({ data }: CeremonyHeroCardProps) {
  const totalHours = data.totalPlayTimeS / 3600;
  const filledPercent = Math.min(totalHours / MAX_HOURS, 1);
  const ringData = [
    { value: filledPercent * 100 },
    { value: 100 - filledPercent * 100 },
  ];

  // Use the `completed` flag (not `status === "completed"`) so archived/
  // uninstalled games (status = "removed") still show the green completion
  // badge when they were actually finished.
  const isCompleted = data.completed;
  const badgeColor = isCompleted
    ? "bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30"
    : "bg-muted text-muted-foreground border-border";
  const badgeLabel = isCompleted ? "Game Complete!" : "Moving On";
  const BadgeIcon = isCompleted ? CheckCircle2 : MoonStar;

  return (
    <div
      data-testid="ceremony-hero-card"
      className="flex h-full flex-col items-center justify-center gap-5 px-8 py-8 text-center"
    >
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${badgeColor}`}
      >
        <BadgeIcon className="size-3.5" />
        {badgeLabel}
      </div>

      <h1 className="max-w-2xl text-4xl font-bold leading-tight text-foreground">
        {data.gameName}
      </h1>

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
              isAnimationActive
              animationBegin={120}
              animationDuration={1500}
            >
              <Cell fill="var(--primary)" />
              <Cell fill="hsl(var(--muted) / 0.3)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold tabular-nums text-foreground">
            {Math.floor(totalHours)}
            <span className="ml-1 text-2xl font-semibold text-primary">h</span>
          </span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            played
          </span>
        </div>
      </div>

      <p className="text-base text-muted-foreground">
        {data.totalSessions === 0
          ? "A brief appearance in your library."
          : `${formatPlayTime(data.totalPlayTimeS)} across ${data.totalSessions} session${
              data.totalSessions !== 1 ? "s" : ""
            }`}
      </p>
    </div>
  );
}
