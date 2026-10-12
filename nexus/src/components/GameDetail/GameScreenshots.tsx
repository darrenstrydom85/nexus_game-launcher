import * as React from "react";
import * as Radix from "radix-ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface GameScreenshotsProps {
  screenshots: string[];
  className?: string;
}

const Dialog = Radix.Dialog;

/** Screenshot grid with a dialog lightbox: focus trapped, Escape closes only the lightbox. */
export function GameScreenshots({ screenshots, className }: GameScreenshotsProps) {
  const [index, setIndex] = React.useState<number | null>(null);
  const open = index !== null;
  const last = screenshots.length - 1;

  const step = React.useCallback(
    (delta: number) => setIndex((i) => (i === null ? i : Math.min(Math.max(i + delta, 0), last))),
    [last],
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // Claim the arrows so pages behind (quick view, game shortcuts) ignore them.
        e.preventDefault();
        step(e.key === "ArrowRight" ? 1 : -1);
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [open, step]);

  if (screenshots.length === 0) return null;

  return (
    <div data-testid="game-screenshots" className={className}>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
        {screenshots.map((url, i) => (
          <button
            key={url}
            type="button"
            data-testid={`screenshot-thumb-${i}`}
            onClick={() => setIndex(i)}
            aria-label={`Open screenshot ${i + 1} of ${screenshots.length}`}
            className="pressable group img-outline aspect-video overflow-hidden rounded-xl bg-secondary outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              draggable={false}
              className="size-full object-cover transition-[filter] duration-150 group-hover:brightness-110"
            />
          </button>
        ))}
      </div>

      <Dialog.Root open={open} onOpenChange={(o) => !o && setIndex(null)}>
        <Dialog.Portal>
          <Dialog.Overlay
            className={cn(
              "fixed inset-0 z-[90] bg-black/90 ease-out",
              "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-200",
              "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
            )}
          />
          <Dialog.Content
            data-testid="screenshot-lightbox"
            aria-describedby={undefined}
            onClick={() => setIndex(null)}
            className="fixed inset-0 z-[91] flex items-center justify-center outline-none"
          >
            <Dialog.Title className="sr-only">
              Screenshot {(index ?? 0) + 1} of {screenshots.length}
            </Dialog.Title>
            {index !== null && (
              <img
                data-testid="lightbox-image"
                src={screenshots[index]}
                alt=""
                onClick={(e) => e.stopPropagation()}
                className={cn(
                  "max-h-[85vh] max-w-[90vw] rounded-xl object-contain ease-out",
                  "data-[state=open]:animate-in data-[state=open]:zoom-in-97 data-[state=open]:duration-200",
                )}
                data-state="open"
              />
            )}
            <Dialog.Close
              data-testid="lightbox-close"
              aria-label="Close screenshot"
              onClick={(e) => e.stopPropagation()}
              className="pressable absolute right-4 top-4 flex size-10 items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white"
            >
              <X className="size-5" strokeWidth={2} />
            </Dialog.Close>
            {index !== null && index > 0 && (
              <LightboxArrow side="left" testId="lightbox-prev" label="Previous screenshot" onClick={() => step(-1)} />
            )}
            {index !== null && index < last && (
              <LightboxArrow side="right" testId="lightbox-next" label="Next screenshot" onClick={() => step(1)} />
            )}
            <span className="absolute bottom-4 text-sm tabular-nums text-white/70">
              {(index ?? 0) + 1} / {screenshots.length}
            </span>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function LightboxArrow({
  side,
  testId,
  label,
  onClick,
}: {
  side: "left" | "right";
  testId: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "pressable absolute flex size-11 items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      {side === "left" ? <ChevronLeft className="size-6" strokeWidth={2} /> : <ChevronRight className="size-6" strokeWidth={2} />}
    </button>
  );
}
