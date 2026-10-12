import * as React from "react";
import { Archive, Check, MoreHorizontal, Search } from "lucide-react";
import { cn, formatPlayTime } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/time";
import type { Game } from "@/stores/gameStore";
import { setGameCompleted } from "@/lib/gameActions";
import { placeholderGradient } from "@/components/GameCard/GameCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, dropdownMenuParts } from "@/components/ui/menu";
import { GameMenuItems, type GameMenuHandlers } from "./GameMenuItems";
import { EmptyState, Stars } from "./CompletedTab";

type ArchiveSort = "playTime" | "name" | "lastPlayed" | "rating";

const SORTS: { value: ArchiveSort; label: string }[] = [
  { value: "playTime", label: "Most played" },
  { value: "name", label: "Name" },
  { value: "lastPlayed", label: "Last played" },
  { value: "rating", label: "Your rating" },
];

interface ArchiveTabProps extends GameMenuHandlers {
  games: Game[];
  selectedId: string | null;
  onOpen: (gameId: string) => void;
  onListChange: (ids: string[]) => void;
}

export function ArchiveTab({ games, selectedId, onOpen, onListChange, ...menu }: ArchiveTabProps) {
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<ArchiveSort>("playTime");

  const archived = React.useMemo(() => games.filter((g) => g.status === "removed"), [games]);
  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? archived.filter((g) => g.name.toLowerCase().includes(q)) : [...archived];
    list.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      if (sort === "lastPlayed") return new Date(b.lastPlayedAt ?? 0).getTime() - new Date(a.lastPlayedAt ?? 0).getTime();
      return b.totalPlayTimeS - a.totalPlayTimeS;
    });
    return list;
  }, [archived, query, sort]);

  React.useEffect(() => onListChange(shown.map((g) => g.id)), [shown, onListChange]);

  if (archived.length === 0) {
    return (
      <EmptyState
        title="No archived games yet"
        body="Games you uninstall show up here after a library sync. Their play history stays, and you can still mark them completed."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2.5 text-sm text-muted-foreground">
          <Archive className="size-4 shrink-0" strokeWidth={1.5} />
          Games you’ve uninstalled. Their play history stays. Mark them completed to add them to your trophy shelf.
        </p>
        <div className="flex items-center gap-2">
          <label className="flex h-9 w-56 items-center gap-2 rounded-lg border border-input bg-background/60 px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="size-4 shrink-0" strokeWidth={1.5} />
            <span className="sr-only">Search archive</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search archive"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          <Select value={sort} onValueChange={(v) => setSort(v as ArchiveSort)}>
            <SelectTrigger aria-label="Sort archive" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table data-testid="archive-table" className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-card text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Game</th>
              <th scope="col" className="px-4 py-3 font-medium">Source</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Play time</th>
              <th scope="col" className="px-4 py-3 font-medium">Last played</th>
              <th scope="col" className="px-4 py-3 font-medium">Rating</th>
              <th scope="col" className="px-4 py-3 font-medium">Completed</th>
              <th scope="col" className="w-12 px-2 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No archived game matches “{query}”.
                </td>
              </tr>
            )}
            {shown.map((g) => (
              <tr
                key={g.id}
                data-game-card={g.id}
                className={cn("border-t border-border transition-[background-color] duration-150", selectedId === g.id ? "bg-accent" : "hover:bg-accent/40")}
              >
                <td className="px-4 py-2">
                  <button
                    type="button"
                    data-testid={`archive-open-${g.id}`}
                    onClick={() => onOpen(g.id)}
                    className="flex items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="img-outline block h-10 w-[30px] shrink-0 overflow-hidden rounded bg-secondary">
                      {g.coverUrl ? (
                        <img src={g.coverUrl} alt="" loading="lazy" className="size-full object-cover" />
                      ) : (
                        <span className="block size-full" style={{ background: placeholderGradient(g.name) }} />
                      )}
                    </span>
                    <span className="font-semibold text-foreground">{g.name}</span>
                  </button>
                </td>
                <td className="px-4 py-2 capitalize text-muted-foreground">{g.source}</td>
                <td className="px-4 py-2 text-right tabular-nums">{g.totalPlayTimeS > 0 ? formatPlayTime(g.totalPlayTimeS) : "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{g.lastPlayedAt ? formatRelativeTime(g.lastPlayedAt) : "Never"}</td>
                <td className="px-4 py-2">
                  <Stars rating={g.rating} />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    data-testid={`archive-completed-${g.id}`}
                    aria-pressed={g.completed}
                    onClick={() => setGameCompleted(g, !g.completed)}
                    className={cn(
                      "pressable flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      g.completed
                        ? "bg-primary/15 text-foreground hover:bg-primary/25"
                        : "border border-input text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {g.completed && <Check className="size-3.5" strokeWidth={2} />}
                    {g.completed ? "Completed" : "Mark completed"}
                  </button>
                </td>
                <td className="px-2 py-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`More actions for ${g.name}`}
                        className="pressable flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <MoreHorizontal className="size-4" strokeWidth={1.5} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <GameMenuItems game={g} parts={dropdownMenuParts} {...menu} />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
