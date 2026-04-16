import { Flame } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonySessionsCardProps {
  data: GameCeremonyData;
}

export function CeremonySessionsCard({ data }: CeremonySessionsCardProps) {
  const longestS = data.longestSessionS;
  const averageS = data.averageSessionS;
  const ratio = longestS > 0 ? Math.max(averageS / longestS, 0.04) : 0;

  return (
    <div
      data-testid="ceremony-sessions-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8 text-center"
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
        <Flame className="size-4" />
        Your Sessions
      </div>

      <h2 className="max-w-2xl text-3xl font-bold text-foreground">
        {longestS >= 3600
          ? `Your longest binge was ${formatPlayTime(longestS)}`
          : `Kept each visit short and sweet`}
      </h2>

      {/* Bar comparison */}
      <div className="flex w-full max-w-xl flex-col gap-4">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Longest session</span>
            <span className="font-bold tabular-nums text-foreground">
              {formatPlayTime(longestS)}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-muted-foreground">Average session</span>
            <span className="font-bold tabular-nums text-foreground">
              {formatPlayTime(averageS)}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-primary/60 transition-all duration-700 ease-out"
              style={{ width: `${ratio * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center">
        <span className="text-4xl font-bold tabular-nums text-foreground">
          {data.totalSessions}
        </span>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Total sessions
        </span>
      </div>
    </div>
  );
}
