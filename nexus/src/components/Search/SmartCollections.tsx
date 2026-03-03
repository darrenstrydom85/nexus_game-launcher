import * as React from "react";
import { cn } from "@/lib/utils";
import { useGameStore, type GameStatus } from "@/stores/gameStore";
import { useFilterStore } from "@/stores/filterStore";
import { Play, Archive, Trophy } from "lucide-react";

interface SmartCollection {
  id: string;
  label: string;
  status: GameStatus;
  icon: React.ReactNode;
  colorClass: string;
}

const SMART_COLLECTIONS: SmartCollection[] = [
  { id: "smart-playing", label: "Currently Playing", status: "playing", icon: <Play className="size-4" />, colorClass: "text-success" },
  { id: "smart-backlog", label: "Backlog", status: "backlog", icon: <Archive className="size-4" />, colorClass: "text-muted-foreground" },
  { id: "smart-completed", label: "Completed", status: "completed", icon: <Trophy className="size-4" />, colorClass: "text-primary" },
];

interface SmartCollectionsProps {
  hiddenIds?: string[];
}

export function SmartCollections({ hiddenIds = [] }: SmartCollectionsProps) {
  const games = useGameStore((s) => s.games);
  const statuses = useFilterStore((s) => s.statuses);
  const toggleStatus = useFilterStore((s) => s.toggleStatus);

  const counts = React.useMemo(() => {
    const map: Record<string, number> = {};
    SMART_COLLECTIONS.forEach((sc) => {
      map[sc.id] = games.filter((g) => g.status === sc.status).length;
    });
    return map;
  }, [games]);

  const visible = SMART_COLLECTIONS.filter((sc) => !hiddenIds.includes(sc.id));

  return (
    <div data-testid="smart-collections" className="flex flex-col gap-0.5">
      {visible.map((sc) => {
        const isActive = statuses.length === 1 && statuses[0] === sc.status;
        return (
          <button
            key={sc.id}
            data-testid={`smart-${sc.status}`}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
              "hover:bg-accent",
              isActive && "bg-accent text-accent-foreground",
            )}
            onClick={() => {
              useFilterStore.getState().clearAll();
              toggleStatus(sc.status);
            }}
          >
            <span className={sc.colorClass}>{sc.icon}</span>
            <span className="flex-1 text-left">{sc.label}</span>
            <span
              data-testid={`smart-count-${sc.status}`}
              className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground"
            >
              {counts[sc.id]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export { SMART_COLLECTIONS };
