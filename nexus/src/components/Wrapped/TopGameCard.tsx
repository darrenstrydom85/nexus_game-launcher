import { formatPlayTime } from "@/lib/utils";
import { HardDriveDownload } from "lucide-react";
import { useGameResolver } from "@/hooks/useGameResolver";
import type { WrappedReport } from "@/types/wrapped";
import { convertFileSrc } from "@tauri-apps/api/core";

interface TopGameCardProps {
  report: WrappedReport;
}

function resolveUrl(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  try {
    return convertFileSrc(url);
  } catch {
    return url;
  }
}

export function TopGameCard({ report }: TopGameCardProps) {
  const { resolve, openGame } = useGameResolver();
  const game = report.mostPlayedGame;

  if (!game) {
    return (
      <div
        data-testid="top-game-card"
        className="flex h-full flex-col items-center justify-center gap-4 px-8"
      >
        <p className="text-muted-foreground">No top game data available.</p>
      </div>
    );
  }

  const coverUrl = resolveUrl(game.coverUrl);
  const percent =
    report.totalPlayTimeS > 0
      ? ((game.playTimeS / report.totalPlayTimeS) * 100).toFixed(1)
      : "0.0";
  const resolved = resolve(game.id, game.name);

  return (
    <button
      data-testid="top-game-card"
      className="relative flex h-full w-full flex-col items-center justify-end overflow-hidden text-left"
      onClick={() => openGame(game.id, game.name)}
    >
      {/* Full-bleed hero image */}
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={game.name}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ filter: "brightness(0.45)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-card to-background" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex w-full flex-col items-center gap-4 px-8 pb-16 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Your #1 Game
        </p>
        <h2 className="text-4xl font-bold text-foreground hover:text-primary transition-colors">
          {game.name}
        </h2>
        {resolved?.isRemoved && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur-sm">
            <HardDriveDownload className="size-3" />
            Uninstalled
          </span>
        )}
        <p className="text-xl text-muted-foreground">
          {formatPlayTime(game.playTimeS)} played &middot;{" "}
          {game.sessionCount} session{game.sessionCount !== 1 ? "s" : ""}
        </p>
        <p className="text-base text-muted-foreground">
          You spent{" "}
          <span className="font-semibold text-foreground">{percent}%</span> of
          your gaming time here
        </p>
      </div>
    </button>
  );
}
