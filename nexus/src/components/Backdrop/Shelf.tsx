import * as React from "react";
import { cn, formatPlayTime } from "@/lib/utils";
import type { Game } from "@/stores/gameStore";

interface ShelfProps {
  title: string;
  count?: number;
  action?: { label: string; onClick: () => void };
  /** Content right after the title, left of the rule (e.g. filter pills). */
  afterTitle?: React.ReactNode;
  /** Extra content on the header line, right of the rule (e.g. sync controls). */
  trailing?: React.ReactNode;
  children: React.ReactNode;
  testid?: string;
  className?: string;
}

/** Backdrop shelf: tracked-caps header, hairline rule, optional trailing action. */
export function Shelf({ title, count, action, afterTitle, trailing, children, testid, className }: ShelfProps) {
  return (
    <section className={cn("flex flex-col gap-3 px-10 pt-5", className)} data-testid={testid}>
      <div className="flex items-center gap-4">
        <h2 className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {title}
          {count !== undefined && <span className="ml-1.5 text-muted-foreground/60">· {count}</span>}
        </h2>
        {afterTitle}
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
      <span className="absolute inset-x-0 bottom-0 block truncate bg-gradient-to-t from-black/85 to-transparent px-2 pb-1.5 pt-6 text-[9px] font-medium uppercase tracking-[0.1em] text-white/90">
        {game.name}
      </span>
    </button>
  );
}

const STATUS_DOT: Record<string, string> = {
  playing: "bg-success",
  completed: "bg-primary",
  backlog: "bg-warning",
  dropped: "bg-destructive",
  wishlist: "bg-info",
};

/**
 * Bare mockup-style cover for the All Games grid: art only, a status dot,
 * and a name/meta strip that appears on hover. Clicking opens details
 * (GameGrid supplies context menus around it).
 */
export function GridCover({ game, onClick }: { game: Game; onClick?: () => void }) {
  const art = game.coverUrl ?? game.heroUrl;
  return (
    <button
      data-testid={`grid-cover-${game.id}`}
      className={cn(
        "group relative aspect-[2/3] w-full overflow-hidden rounded-md bg-card text-left",
        "transition-all duration-200 hover:ring-1 hover:ring-foreground/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      onClick={onClick}
      aria-label={game.name}
    >
      {art ? (
        <img
          src={art}
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center font-display text-3xl font-bold text-muted-foreground">
          {game.name.slice(0, 2).toUpperCase()}
        </span>
      )}
      {STATUS_DOT[game.status] && (
        <span
          className={cn("absolute right-2 top-2 size-2 rounded-full ring-1 ring-black/40", STATUS_DOT[game.status])}
          title={game.status}
          aria-hidden
        />
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col bg-gradient-to-t from-black/90 to-transparent px-2.5 pb-2 pt-8 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="block truncate text-[10px] font-medium uppercase tracking-[0.1em] text-white">
          {game.name}
        </span>
        {game.totalPlayTimeS > 0 && (
          <span className="text-[9px] text-white/70">{formatPlayTime(game.totalPlayTimeS)}</span>
        )}
      </span>
    </button>
  );
}
