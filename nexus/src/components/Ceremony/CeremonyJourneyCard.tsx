import { CalendarDays } from "lucide-react";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonyJourneyCardProps {
  data: GameCeremonyData;
}

function formatIsoDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function CeremonyJourneyCard({ data }: CeremonyJourneyCardProps) {
  const firstLabel = data.firstPlayedAt ? formatIsoDate(data.firstPlayedAt) : "—";
  const lastLabel = data.lastPlayedAt ? formatIsoDate(data.lastPlayedAt) : "—";

  return (
    <div
      data-testid="ceremony-journey-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8 text-center"
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
        <CalendarDays className="size-4" />
        Your Journey
      </div>

      <h2 className="max-w-2xl text-3xl font-bold text-foreground">
        {data.daysBetweenFirstAndLast > 0
          ? `${data.daysBetweenFirstAndLast} day${data.daysBetweenFirstAndLast !== 1 ? "s" : ""}`
          : "A single day's adventure"}
      </h2>
      <p className="max-w-lg text-base text-muted-foreground">
        {data.daysBetweenFirstAndLast > 0
          ? `That's the span between the first time you pressed play and the last.`
          : `You packed your whole journey into a single day.`}
      </p>

      {/* Timeline */}
      <div className="flex w-full max-w-2xl items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <span className="size-3 rounded-full bg-primary shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            First
          </span>
          <span className="text-sm font-semibold text-foreground">
            {firstLabel}
          </span>
        </div>

        <div className="relative flex-1">
          <div className="h-[2px] w-full bg-gradient-to-r from-primary/60 via-primary/30 to-primary/60" />
          {/* Cluster dots */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="size-1.5 rounded-full bg-primary/40"
                aria-hidden
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="size-3 rounded-full bg-primary shadow-[0_0_12px_rgba(59,130,246,0.6)]" />
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Last
          </span>
          <span className="text-sm font-semibold text-foreground">
            {lastLabel}
          </span>
        </div>
      </div>

      <div className="mt-4 flex gap-12">
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {data.totalSessions}
          </span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Sessions
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {data.playTimeByMonth.length}
          </span>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            Months
          </span>
        </div>
      </div>
    </div>
  );
}
