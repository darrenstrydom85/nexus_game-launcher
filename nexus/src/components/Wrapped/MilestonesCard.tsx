import * as React from "react";
import { Flame, Trophy, Calendar, Gamepad2, HardDriveDownload } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import { useGameResolver, type ResolvedGame } from "@/hooks/useGameResolver";
import type { WrappedReport } from "@/types/wrapped";

interface MilestonesCardProps {
  report: WrappedReport;
}

function formatDate(iso: string): string {
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

interface MilestoneRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
  resolved?: ResolvedGame | null;
}

function MilestoneRow({ icon, label, value, sub, onClick, resolved }: MilestoneRowProps) {
  return (
    <div
      className={`flex items-start gap-4 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm ${onClick ? "cursor-pointer transition-colors hover:bg-white/5" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={`mt-0.5 flex items-center gap-1.5 truncate text-base font-semibold ${onClick ? "text-foreground hover:text-primary" : "text-foreground"}`}>
          {resolved?.isRemoved && <HardDriveDownload className="size-3.5 shrink-0 text-muted-foreground" />}
          <span className="truncate">{value}</span>
        </p>
        {sub && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
        )}
      </div>
    </div>
  );
}

export function MilestonesCard({ report }: MilestonesCardProps) {
  const { resolve, openGame } = useGameResolver();

  const longestSessionResolved = report.longestSession
    ? resolve(report.longestSession.gameId, report.longestSession.gameName)
    : null;
  const firstGameResolved = report.firstGamePlayed
    ? resolve(report.firstGamePlayed.id, report.firstGamePlayed.name)
    : null;
  const lastGameResolved = report.lastGamePlayed
    ? resolve(report.lastGamePlayed.id, report.lastGamePlayed.name)
    : null;

  return (
    <div
      data-testid="milestones-card"
      className="flex h-full flex-col justify-center gap-6 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Milestones
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          Your highlights
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {report.longestSession && (
          <MilestoneRow
            icon={<Flame className="size-5" />}
            label="Epic Binge"
            value={`${formatPlayTime(report.longestSession.durationS)} on ${report.longestSession.gameName}`}
            sub={formatDate(report.longestSession.startedAt)}
            onClick={longestSessionResolved ? () => openGame(report.longestSession!.gameId, report.longestSession!.gameName) : undefined}
            resolved={longestSessionResolved}
          />
        )}

        {report.longestStreakDays > 0 && (
          <MilestoneRow
            icon={<Trophy className="size-5" />}
            label="Longest Streak"
            value={`${report.longestStreakDays} day${report.longestStreakDays !== 1 ? "s" : ""} in a row`}
          />
        )}

        {report.busiestDay && (
          <MilestoneRow
            icon={<Calendar className="size-5" />}
            label="Busiest Day"
            value={formatDate(report.busiestDay)}
            sub={formatPlayTime(report.busiestDayPlayTimeS) + " played"}
          />
        )}

        {report.firstGamePlayed && (
          <MilestoneRow
            icon={<Gamepad2 className="size-5" />}
            label="First Game Played"
            value={report.firstGamePlayed.name}
            onClick={firstGameResolved ? () => openGame(report.firstGamePlayed!.id, report.firstGamePlayed!.name) : undefined}
            resolved={firstGameResolved}
          />
        )}

        {report.lastGamePlayed && (
          <MilestoneRow
            icon={<Gamepad2 className="size-5" />}
            label="Last Game Played"
            value={report.lastGamePlayed.name}
            onClick={lastGameResolved ? () => openGame(report.lastGamePlayed!.id, report.lastGamePlayed!.name) : undefined}
            resolved={lastGameResolved}
          />
        )}
      </div>
    </div>
  );
}
