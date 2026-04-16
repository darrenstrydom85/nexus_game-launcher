import * as React from "react";
import { cn } from "@/lib/utils";
import { useXpStore } from "@/stores/xpStore";
import { Zap, Trophy, Flame, Rocket, Award, Target, Gamepad2 } from "lucide-react";

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  session_complete: <Gamepad2 className="size-3.5" />,
  session_bonus_1h: <Rocket className="size-3.5" />,
  achievement_unlock: <Award className="size-3.5" />,
  game_complete: <Trophy className="size-3.5" />,
  streak_day: <Flame className="size-3.5" />,
  game_launch: <Zap className="size-3.5" />,
  goal_complete: <Target className="size-3.5" />,
};

function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  if (diffMs < 604_800_000) return `${Math.floor(diffMs / 86_400_000)}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

export function XpHistoryList() {
  const history = useXpStore((s) => s.history);

  if (history.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center">
        <p className="text-sm text-muted-foreground">No XP events yet. Start playing!</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Recent XP
      </h4>
      <div className="flex flex-col gap-1 max-h-[320px] overflow-y-auto scrollbar-thin">
        {history.map((event) => (
          <div
            key={event.id}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm",
              "transition-colors hover:bg-accent/50",
            )}
          >
            <span className="shrink-0 text-muted-foreground">
              {SOURCE_ICONS[event.source] ?? <Zap className="size-3.5" />}
            </span>
            <span className="flex-1 truncate text-muted-foreground">
              {event.description}
            </span>
            <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium tabular-nums text-primary">
              +{event.xpAmount} XP
            </span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground/60">
              {relativeTime(event.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
