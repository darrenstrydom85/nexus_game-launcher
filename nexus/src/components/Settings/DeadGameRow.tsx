import * as React from "react";
import { motion } from "motion/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Copy, FolderSearch, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DeadGame } from "@/lib/tauri";

const SOURCE_LABELS: Record<string, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

function formatPlayTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatLastPlayed(iso: string | null): string {
  if (!iso) return "Never played";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return "Unknown";
  }
}

interface DeadGameRowProps {
  game: DeadGame;
  coverUrl?: string | null;
  onRemove: (id: string) => void;
  onPathFixed: (id: string, newPath: string) => void;
}

export function DeadGameRow({ game, coverUrl, onRemove, onPathFixed }: DeadGameRowProps) {
  const [copied, setCopied] = React.useState(false);
  const [fixing, setFixing] = React.useState(false);

  const handleCopyPath = React.useCallback(() => {
    const path = game.exePath ?? "";
    navigator.clipboard.writeText(path).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [game.exePath]);

  const handleFixPath = React.useCallback(async () => {
    setFixing(true);
    try {
      const defaultPath = game.folderPath ?? undefined;
      const selected = await openDialog({
        multiple: false,
        defaultPath,
        filters: [{ name: "Executable", extensions: ["exe"] }],
      });
      if (selected && typeof selected === "string") {
        await invoke("update_game", {
          id: game.id,
          fields: { exePath: selected },
        });
        onPathFixed(game.id, selected);
      }
    } catch {
      // user cancelled
    } finally {
      setFixing(false);
    }
  }, [game.id, game.folderPath, onPathFixed]);

  const truncatedPath = React.useMemo(() => {
    const p = game.exePath ?? "(no path)";
    return p.length > 60 ? `…${p.slice(-57)}` : p;
  }, [game.exePath]);

  return (
    <motion.div
      data-testid={`dead-game-row-${game.id}`}
      layout
      initial={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-3 rounded-lg border border-border bg-secondary/20 p-3"
    >
      {/* Cover art */}
      <div className="size-12 shrink-0 overflow-hidden rounded-md bg-secondary">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={game.name}
            className="size-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <FolderSearch className="size-5" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{game.name}</span>
          <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {SOURCE_LABELS[game.source] ?? game.source}
          </span>
        </div>

        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{formatLastPlayed(game.lastPlayed)}</span>
          {game.totalPlayTimeS > 0 && (
            <span>{formatPlayTime(game.totalPlayTimeS)} played</span>
          )}
        </div>

        {/* Missing exe path */}
        <div className="mt-1.5 flex items-center gap-1.5">
          <code
            data-testid={`dead-game-path-${game.id}`}
            className="flex-1 truncate rounded bg-black/30 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
            title={game.exePath ?? "(no path)"}
          >
            {truncatedPath}
          </code>
          <button
            data-testid={`dead-game-copy-${game.id}`}
            className={cn(
              "shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground",
              copied && "text-success",
            )}
            onClick={handleCopyPath}
            aria-label="Copy path"
            title="Copy path"
          >
            <Copy className="size-3" />
          </button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col gap-1.5">
        <Button
          data-testid={`dead-game-fix-${game.id}`}
          variant="secondary"
          size="xs"
          className="gap-1 text-xs"
          disabled={fixing}
          onClick={handleFixPath}
        >
          <FolderSearch className="size-3" />
          {fixing ? "Browsing…" : "Fix Path"}
        </Button>
        <Button
          data-testid={`dead-game-remove-${game.id}`}
          variant="ghost"
          size="xs"
          className="gap-1 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onRemove(game.id)}
        >
          <Trash2 className="size-3" />
          Remove
        </Button>
      </div>
    </motion.div>
  );
}
