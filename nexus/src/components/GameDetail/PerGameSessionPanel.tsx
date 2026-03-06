import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SessionList } from "./SessionList";
import { SessionPatternsCharts } from "./SessionPatternsCharts";
import { SessionHistogram } from "@/components/Stats/SessionHistogram";
import type { PerGameSessionStats } from "@/types/analytics";

interface SessionsSkeletonProps {
  rows?: number;
}

function SessionsSkeleton({ rows = 6 }: SessionsSkeletonProps) {
  return (
    <div data-testid="sessions-skeleton" className="animate-pulse space-y-2">
      <div className="mb-3 h-4 w-20 rounded bg-muted" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between py-1.5">
          <div className="h-3 w-20 rounded bg-muted" />
          <div className="flex gap-2">
            <div className="h-3 w-12 rounded bg-muted" />
            <div className="h-4 w-10 rounded-full bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export interface PerGameSessionPanelProps {
  stats: PerGameSessionStats | null;
  isLoading: boolean;
  onViewFullStats?: () => void;
}

export function PerGameSessionPanel({
  stats,
  isLoading,
  onViewFullStats,
}: PerGameSessionPanelProps) {
  return (
    <div data-testid="per-game-session-panel">
      <Tabs defaultValue="sessions">
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="sessions" data-testid="tab-sessions">
            Sessions
          </TabsTrigger>
          <TabsTrigger value="patterns" data-testid="tab-patterns">
            Patterns
          </TabsTrigger>
          <TabsTrigger value="distribution" data-testid="tab-distribution">
            Distribution
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          {isLoading ? (
            <SessionsSkeleton />
          ) : stats ? (
            <SessionList sessions={stats.sessions} />
          ) : null}
        </TabsContent>

        <TabsContent value="patterns">
          {isLoading ? (
            <SessionsSkeleton rows={4} />
          ) : stats ? (
            <SessionPatternsCharts
              playTimeByMonth={stats.playTimeByMonth}
              playTimeByDayOfWeek={stats.playTimeByDayOfWeek}
              averageGapDays={stats.averageGapDays}
              totalSessions={stats.sessions.length}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="distribution">
          {isLoading ? (
            <SessionsSkeleton rows={4} />
          ) : stats ? (
            <SessionHistogram
              distribution={stats.distribution}
              isLoading={false}
              hideScope
            />
          ) : null}
        </TabsContent>
      </Tabs>

      {onViewFullStats && (
        <button
          data-testid="view-full-stats-link"
          className="mt-4 w-full rounded-md bg-secondary py-1.5 text-center text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={onViewFullStats}
        >
          View full stats
        </button>
      )}
    </div>
  );
}
