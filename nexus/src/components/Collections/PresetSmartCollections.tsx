import * as React from "react";
import { cn } from "@/lib/utils";
import { Sparkles } from "lucide-react";
import { evaluateSmartCollection } from "@/lib/tauri";
import type { SmartCollectionRuleGroup } from "@/lib/tauri";

export interface SmartCollectionPreset {
  name: string;
  icon: string;
  rules: SmartCollectionRuleGroup;
  description: string;
  requiresHltb?: boolean;
}

export const SMART_COLLECTION_PRESETS: SmartCollectionPreset[] = [
  {
    name: "Quick Plays",
    icon: "⚡",
    description: "Short backlog games (< 5h HLTB)",
    requiresHltb: true,
    rules: {
      operator: "and",
      conditions: [
        { field: "status", op: "equals", value: "backlog" },
        { field: "hltbMainH", op: "lt", value: 5 },
      ],
    },
  },
  {
    name: "Forgotten Gems",
    icon: "💎",
    description: "Added 6+ months ago, never played, rated 3+",
    rules: {
      operator: "and",
      conditions: [
        { field: "addedAt", op: "before_days_ago", value: 180 },
        { field: "lastPlayed", op: "never", value: null },
        { field: "rating", op: "gt", value: 2 },
      ],
    },
  },
  {
    name: "Recently Added",
    icon: "🆕",
    description: "Games added in the last 30 days",
    rules: {
      operator: "and",
      conditions: [{ field: "addedAt", op: "within_days", value: 30 }],
    },
  },
  {
    name: "Long Overdue",
    icon: "⏰",
    description: "Playing but not touched in 30+ days",
    rules: {
      operator: "and",
      conditions: [
        { field: "status", op: "equals", value: "playing" },
        { field: "lastPlayed", op: "before_days_ago", value: 30 },
      ],
    },
  },
  {
    name: "Highly Rated Unplayed",
    icon: "🏆",
    description: "Critic score 80+ with zero play time",
    rules: {
      operator: "and",
      conditions: [
        { field: "criticScore", op: "gt", value: 79 },
        { field: "playCount", op: "equals", value: 0 },
      ],
    },
  },
  {
    name: "Weekend Warriors",
    icon: "🎮",
    description: "10-30h backlog games for a weekend",
    requiresHltb: true,
    rules: {
      operator: "and",
      conditions: [
        { field: "status", op: "equals", value: "backlog" },
        { field: "hltbMainH", op: "between", value: [10, 30] },
      ],
    },
  },
];

interface PresetSmartCollectionsProps {
  onSelect: (preset: SmartCollectionPreset) => void;
}

export function PresetSmartCollections({ onSelect }: PresetSmartCollectionsProps) {
  const [counts, setCounts] = React.useState<Record<string, number | null>>({});

  React.useEffect(() => {
    let cancelled = false;

    async function fetchCounts() {
      const results: Record<string, number | null> = {};
      for (const preset of SMART_COLLECTION_PRESETS) {
        try {
          const ids = await evaluateSmartCollection(JSON.stringify(preset.rules));
          if (cancelled) return;
          results[preset.name] = ids.length;
        } catch {
          results[preset.name] = null;
        }
      }
      if (!cancelled) setCounts(results);
    }

    fetchCounts();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">Suggested Smart Collections</p>
      <div className="grid grid-cols-2 gap-2">
        {SMART_COLLECTION_PRESETS.map((preset) => {
          const count = counts[preset.name];
          return (
            <button
              key={preset.name}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border border-border bg-card/60 p-3 text-left",
                "transition-colors hover:border-primary/40 hover:bg-card",
              )}
              onClick={() => onSelect(preset)}
            >
              <div className="flex w-full items-center gap-2">
                <span className="text-base">{preset.icon}</span>
                <span className="flex-1 truncate text-sm font-medium text-foreground">
                  {preset.name}
                </span>
                {count !== undefined && count !== null && (
                  <span className="rounded-full bg-secondary px-1.5 text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{preset.description}</p>
              {preset.requiresHltb && (
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                  <Sparkles className="size-2.5" />
                  Requires HLTB data
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
