import { Share2, X, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonyFinalCardProps {
  data: GameCeremonyData;
  onClose: () => void;
  onShare: () => void;
}

export function CeremonyFinalCard({ data, onClose, onShare }: CeremonyFinalCardProps) {
  const rating = data.rating ?? 0;

  return (
    <div
      data-testid="ceremony-final-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8 text-center"
    >
      <h2 className="max-w-2xl text-3xl font-bold text-foreground">
        {data.completed
          ? "Thanks for the adventure"
          : "Every game deserves a send-off"}
      </h2>
      <p className="max-w-lg text-base text-muted-foreground">
        Save your certificate or simply close the ceremony. You can always
        replay it from the game's detail page.
      </p>

      {/* Rating stars */}
      {rating > 0 && (
        <div
          data-testid="ceremony-rating"
          className="flex items-center gap-1.5"
          aria-label={`Rated ${rating} out of 5`}
        >
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={cn(
                "size-6",
                i < rating
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/40",
              )}
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          data-testid="ceremony-share"
          onClick={onShare}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5",
            "bg-primary text-sm font-semibold text-primary-foreground",
            "transition-opacity hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <Share2 className="size-4" />
          Share Certificate
        </button>
        <button
          type="button"
          data-testid="ceremony-close-final"
          onClick={onClose}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5",
            "border border-border bg-card text-sm font-medium text-foreground",
            "transition-colors hover:bg-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <X className="size-4" />
          Close
        </button>
      </div>
    </div>
  );
}
