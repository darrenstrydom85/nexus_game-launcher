import * as React from "react";
import { cn } from "@/lib/utils";
import type { Game } from "@/stores/gameStore";
import { placeholderGradient } from "@/components/GameCard/GameCard";

const CARD_WIDTH = 120;
const CARD_GAP = 8;
const ITEM_SIZE = CARD_WIDTH + CARD_GAP;
const INITIAL_VELOCITY = 2800;
const FRICTION = 0.985;
const STOP_VELOCITY = 20;

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    const j = array[0] % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

interface RouletteSpinnerProps {
  pool: Game[];
  onComplete: (game: Game) => void;
}

export function RouletteSpinner({ pool, onComplete }: RouletteSpinnerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const offsetRef = React.useRef(0);
  const [displayOffset, setDisplayOffset] = React.useState(0);
  const [settled, setSettled] = React.useState(false);
  const [showGlow, setShowGlow] = React.useState(false);
  const [landedIdx, setLandedIdx] = React.useState(-1);
  const animRef = React.useRef<number>(0);

  const strip = React.useMemo(() => {
    const reps = Math.max(8, Math.ceil(50 / pool.length));
    const arr: Game[] = [];
    for (let i = 0; i < reps; i++) arr.push(...shuffleArray(pool));
    return arr;
  }, [pool]);

  React.useEffect(() => {
    let velocity = INITIAL_VELOCITY;
    let lastTime = performance.now();
    offsetRef.current = 0;

    function animate(time: number) {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      velocity *= FRICTION;
      offsetRef.current += velocity * dt;
      setDisplayOffset(offsetRef.current);

      if (velocity < STOP_VELOCITY) {
        const nearestIdx = Math.round(offsetRef.current / ITEM_SIZE);
        const snappedOffset = nearestIdx * ITEM_SIZE;
        offsetRef.current = snappedOffset;
        setDisplayOffset(snappedOffset);
        setSettled(true);

        const clampedIdx = Math.max(0, Math.min(nearestIdx, strip.length - 1));
        setLandedIdx(clampedIdx);

        setTimeout(() => {
          setShowGlow(true);
          setTimeout(() => {
            onComplete(strip[clampedIdx]);
          }, 600);
        }, 300);
        return;
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [strip, onComplete]);

  const containerWidth = containerRef.current?.clientWidth ?? 0;
  const translateX = containerWidth / 2 - displayOffset - CARD_WIDTH / 2;

  return (
    <div ref={containerRef} data-testid="roulette-spinner" className="relative w-full overflow-hidden py-4">
      {/* Center indicator */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_8px_var(--glow)]" />

      <div
        data-testid="roulette-strip"
        className="flex"
        style={{
          gap: `${CARD_GAP}px`,
          transform: `translateX(${translateX}px)`,
          transition: settled ? "transform 0.35s cubic-bezier(0.33, 1, 0.68, 1)" : "none",
        }}
      >
        {strip.map((game, i) => (
          <div
            key={`${game.id}-${i}`}
            data-testid={`roulette-card-${i}`}
            className={cn(
              "shrink-0 overflow-hidden rounded-lg transition-shadow duration-300",
              showGlow && i === landedIdx
                ? "ring-2 ring-primary shadow-[0_0_24px_var(--glow)]"
                : "",
            )}
            style={{ width: CARD_WIDTH, height: CARD_WIDTH * 1.5 }}
          >
            {game.coverUrl ? (
              <img src={game.coverUrl} alt={game.name} className="h-full w-full object-cover" />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center text-xs text-white/60"
                style={{ background: placeholderGradient(game.name) }}
              >
                {game.name.charAt(0)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
