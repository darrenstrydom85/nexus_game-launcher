import * as React from "react";
import type { Game, GameSource } from "@/stores/gameStore";
import { Copy, Check } from "lucide-react";

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic Games",
  gog: "GOG",
  ubisoft: "Ubisoft Connect",
  battlenet: "Battle.net",
  xbox: "Xbox / Game Pass",
  standalone: "Standalone",
};

interface GameMetadataProps {
  game: Game;
}

export function GameMetadata({ game }: GameMetadataProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopyPath = React.useCallback(() => {
    if (!game.folderPath) return;
    navigator.clipboard.writeText(game.folderPath).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [game.folderPath]);

  return (
    <div data-testid="game-metadata" className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Game Info</h3>

      <dl className="flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Source</dt>
          <dd data-testid="meta-source" className="text-foreground">
            {SOURCE_LABELS[game.source]}
          </dd>
        </div>
        {game.folderPath && (
          <div>
            <dt className="mb-1 text-muted-foreground">Install Path</dt>
            <dd className="flex items-center gap-1">
              <code
                data-testid="meta-install-path"
                className="flex-1 truncate rounded bg-secondary px-2 py-1 text-xs text-muted-foreground"
              >
                {game.folderPath}
              </code>
              <button
                data-testid="meta-copy-path"
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                onClick={handleCopyPath}
                aria-label="Copy install path"
              >
                {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              </button>
            </dd>
          </div>
        )}
        {game.exeName && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Executable</dt>
            <dd data-testid="meta-exe" className="text-foreground">{game.exeName}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
