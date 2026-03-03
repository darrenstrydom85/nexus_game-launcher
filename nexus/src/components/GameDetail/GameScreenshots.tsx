import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface GameScreenshotsProps {
  screenshots: string[];
}

export function GameScreenshots({ screenshots }: GameScreenshotsProps) {
  const [lightboxIdx, setLightboxIdx] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (lightboxIdx === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i));
      else if (e.key === "ArrowRight") setLightboxIdx((i) => (i !== null && i < screenshots.length - 1 ? i + 1 : i));
      else if (e.key === "Escape") setLightboxIdx(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [lightboxIdx, screenshots.length]);

  if (screenshots.length === 0) return null;

  return (
    <div data-testid="game-screenshots">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Screenshots</h3>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {screenshots.map((url, i) => (
          <button
            key={url}
            data-testid={`screenshot-thumb-${i}`}
            className="shrink-0 overflow-hidden rounded-lg transition-transform hover:scale-105"
            onClick={() => setLightboxIdx(i)}
          >
            <img
              src={url}
              alt={`Screenshot ${i + 1}`}
              className="h-24 w-40 object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIdx !== null && (
          <motion.div
            data-testid="screenshot-lightbox"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxIdx(null)}
          >
            <button
              data-testid="lightbox-close"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              onClick={() => setLightboxIdx(null)}
              aria-label="Close lightbox"
            >
              <X className="size-5" />
            </button>

            {lightboxIdx > 0 && (
              <button
                data-testid="lightbox-prev"
                className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
                aria-label="Previous screenshot"
              >
                <ChevronLeft className="size-6" />
              </button>
            )}

            <img
              data-testid="lightbox-image"
              src={screenshots[lightboxIdx]}
              alt={`Screenshot ${lightboxIdx + 1}`}
              className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {lightboxIdx < screenshots.length - 1 && (
              <button
                data-testid="lightbox-next"
                className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
                onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
                aria-label="Next screenshot"
              >
                <ChevronRight className="size-6" />
              </button>
            )}

            <span className="absolute bottom-4 text-sm text-white/60">
              {lightboxIdx + 1} / {screenshots.length}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
