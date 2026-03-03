import * as React from "react";
import { RotateCcw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fetchMetadata } from "@/lib/tauri";
import { useGameStore } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";
import type { SyncError } from "@/stores/syncStore";
import { cn } from "@/lib/utils";

/** 16px metadata source indicator for SteamGridDB / IGDB (sync error context). */
function MetadataSourceIcon({ source }: { source: string }) {
  const label =
    source === "SteamGridDB"
      ? "SG"
      : source === "IGDB"
        ? "IG"
        : source.slice(0, 2).toUpperCase();
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium text-muted-foreground"
      title={source}
      aria-hidden
    >
      {label}
    </span>
  );
}

export interface SyncErrorPopoverProps {
  errors: SyncError[];
}

export function SyncErrorPopover({ errors }: SyncErrorPopoverProps) {
  const games = useGameStore((s) => s.games);
  const addToast = useToastStore((s) => s.addToast);
  const getGameName = React.useCallback(
    (gameId: string) =>
      games.find((g) => g.id === gameId)?.name ?? gameId,
    [games],
  );

  const handleRetryOne = React.useCallback(
    async (gameId: string, gameName: string) => {
      try {
        await fetchMetadata(gameId);
        addToast({
          type: "success",
          message: `Retrying metadata for ${gameName}.`,
        });
      } catch (e) {
        addToast({
          type: "error",
          message: e instanceof Error ? e.message : "Failed to retry metadata.",
        });
      }
    },
    [addToast],
  );

  const handleRetryAll = React.useCallback(async () => {
    const names: string[] = [];
    for (const err of errors) {
      try {
        await fetchMetadata(err.gameId);
        const name = getGameName(err.gameId);
        names.push(name);
      } catch (e) {
        addToast({
          type: "error",
          message: `Failed to retry ${getGameName(err.gameId)}: ${e instanceof Error ? e.message : "Unknown error"}`,
        });
      }
    }
    if (names.length > 0) {
      addToast({
        type: "success",
        message: `Retrying metadata for ${names.length} game${names.length === 1 ? "" : "s"}.`,
      });
    }
  }, [errors, addToast, getGameName]);

  if (errors.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
          data-testid="sync-errors-badge"
          aria-label={`${errors.length} sync errors`}
        >
          {errors.length} errors
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        role="dialog"
        aria-label="Sync errors"
        className="w-auto min-w-[240px] p-0"
        data-testid="sync-error-popover"
      >
        <div className="flex flex-col">
          <h3 className="px-4 pt-4 pb-2 text-sm font-semibold leading-tight">
            Sync errors ({errors.length})
          </h3>
          <div
            className="max-h-[240px] overflow-y-auto px-2 pb-2"
            style={{ maxHeight: 240 }}
          >
            <ul className="space-y-1">
              {errors.map((err) => (
                <li
                  key={`${err.gameId}-${err.source}-${err.message}`}
                  className="flex items-start gap-2 rounded-md px-2 py-1.5"
                >
                  <MetadataSourceIcon source={err.source} />
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm text-foreground"
                      title={getGameName(err.gameId)}
                    >
                      {getGameName(err.gameId)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {err.message}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleRetryOne(err.gameId, getGameName(err.gameId));
                    }}
                    aria-label={`Retry ${getGameName(err.gameId)}`}
                    data-testid={`sync-error-retry-${err.gameId}`}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border px-4 py-2">
            <button
              type="button"
              className={cn(
                "text-sm font-medium text-primary underline-offset-4",
                "hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded",
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleRetryAll();
              }}
              data-testid="sync-error-retry-all"
            >
              Retry all
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
