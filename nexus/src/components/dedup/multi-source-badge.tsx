import { useEffect, useState } from "react";
import type { DuplicateMember } from "@/lib/tauri";
import type { GameSource } from "@/stores/gameStore";
import { useDedupStore } from "@/stores/dedupStore";
import { SourceIcon, SOURCE_LABELS } from "./source-icon";
import { cn } from "@/lib/utils";

interface MultiSourceBadgeProps {
  gameId: string;
  onSwitchSource?: (member: DuplicateMember) => void;
  className?: string;
}

export function MultiSourceBadge({
  gameId,
  onSwitchSource,
  className,
}: MultiSourceBadgeProps) {
  const loadGameSources = useDedupStore((s) => s.loadGameSources);
  const cached = useDedupStore((s) => s.gameSourcesCache[gameId]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loadGameSources(gameId);
  }, [gameId, loadGameSources]);

  const sources = cached ?? [];

  if (sources.length < 2) return null;

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="flex items-center gap-0.5 rounded-md bg-black/70 backdrop-blur-sm px-1.5 py-0.5 transition-colors hover:bg-black/90"
        title="Available from multiple sources"
      >
        {sources.map((s) => (
          <SourceIcon
            key={s.gameId}
            source={s.source as GameSource}
            size="sm"
          />
        ))}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute top-full left-0 z-50 mt-1 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-lg">
            <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
              Launch from
            </p>
            {sources.map((member) => (
              <button
                key={member.gameId}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwitchSource?.(member);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  member.isPreferred && "bg-accent/50",
                )}
              >
                <SourceIcon source={member.source as GameSource} size="md" />
                <span className="flex-1 text-left">
                  {SOURCE_LABELS[member.source as GameSource]}
                </span>
                {member.isPreferred && (
                  <span className="text-[10px] font-medium text-primary">
                    Preferred
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
