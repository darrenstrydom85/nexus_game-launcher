import * as React from "react";
import { Play } from "lucide-react";

interface GameTrailerProps {
  youtubeId: string | null;
}

export function GameTrailer({ youtubeId }: GameTrailerProps) {
  const [playing, setPlaying] = React.useState(false);

  if (!youtubeId) return null;

  const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

  return (
    <div data-testid="game-trailer" className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Trailer</h3>
      </div>
      <div className="relative aspect-video">
        {playing ? (
          <iframe
            data-testid="trailer-iframe"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1`}
            className="h-full w-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
            title="Game trailer"
          />
        ) : (
          <button
            data-testid="trailer-thumbnail"
            className="group relative h-full w-full"
            onClick={() => setPlaying(true)}
          >
            <img
              src={thumbnailUrl}
              alt="Trailer thumbnail"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/50">
              <div className="flex size-12 items-center justify-center rounded-full bg-primary/90 text-white shadow-lg transition-transform group-hover:scale-110">
                <Play className="size-5 translate-x-0.5" />
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
