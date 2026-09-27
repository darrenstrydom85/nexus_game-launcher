import * as React from "react";
import { cn } from "@/lib/utils";
import type { Game } from "@/stores/gameStore";

interface ShelfProps {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
  /** Extra content on the header line, right of the rule (e.g. sync controls). */
  trailing?: React.ReactNode;
  children: React.ReactNode;
  testid?: string;
  className?: string;
}

/** Backdrop shelf: tracked-caps header, hairline rule, optional trailing action. */
export function Shelf({ title, count, action, trailing, children, testid, className }: ShelfProps) {
  return (
    <section className={cn("flex flex-col gap-3 px-10 pt-5", className)} data-testid={testid}>
      <div className="flex items-center gap-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {title}
          {count !== undefined && <span className="ml-1.5 text-muted-foreground/60">· {count}</span>}
        </h2>
        <div className="h-px flex-1 bg-foreground/10" />
        {trailing}
        {action && (
          <button
            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

interface ShelfCoverProps {
  game: Game;
  selected?: boolean;
  onClick: () => void;
  /** Larger tiles for the primary shelf. */
  size?: "md" | "lg";
}

/** Portrait cover tile for shelves. Click retargets the hero stage. */
export function ShelfCover({ game, selected, onClick, size = "md" }: ShelfCoverProps) {
  const art = game.coverUrl ?? game.heroUrl;
  return (
    <button
      data-testid={`shelf-cover-${game.id}`}
      className={cn(
        "group relative shrink-0 overflow-hidden rounded-md bg-card text-left",
        "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "lg" ? "h-[168px] w-28" : "h-[144px] w-24",
        selected
          ? "ring-2 ring-offset-2 ring-offset-background"
          : "opacity-90 hover:opacity-100 hover:ring-1 hover:ring-foreground/30",
      )}
      style={selected ? { ["--tw-ring-color" as string]: "var(--game-accent, var(--primary))" } : undefined}
      onClick={onClick}
      aria-label={game.name}
      aria-pressed={selected}
    >
      {art ? (
        <img
          src={art}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-display text-2xl font-bold text-muted-foreground">
          {game.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 line-clamp-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-[9px] font-medium uppercase tracking-[0.1em] text-white/90">
        {game.name}
      </span>
    </button>
  );
}
