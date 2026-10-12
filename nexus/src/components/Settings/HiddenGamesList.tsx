import { Gamepad2, Eye } from "lucide-react";
import { useHiddenGames } from "@/modern/settings/hooks/useHiddenGames";

export function HiddenGamesList() {
  const { hiddenGames, unhide: handleUnhide, unhideAll: handleUnhideAll } = useHiddenGames();

  if (hiddenGames.length === 0) return null;

  return (
    <div data-testid="hidden-games-section">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {hiddenGames.length} hidden game{hiddenGames.length !== 1 ? "s" : ""}
        </span>
        <button
          data-testid="unhide-all"
          className="text-xs text-primary hover:underline"
          onClick={handleUnhideAll}
        >
          Unhide all
        </button>
      </div>

      <ul
        data-testid="hidden-games-list"
        className="max-h-[9rem] overflow-y-auto rounded-md border border-border bg-surface-1"
      >
        {hiddenGames.map(({ id, name, coverUrl }) => (
          <li
            key={id}
            data-testid={`hidden-game-row-${id}`}
            className="flex items-center gap-2 px-2 py-1.5 hover:bg-surface-2"
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={name}
                className="size-8 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded bg-surface-2">
                <Gamepad2 className="size-4 text-muted-foreground" />
              </div>
            )}

            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</span>

            <button
              data-testid={`unhide-btn-${id}`}
              className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs text-primary hover:bg-surface-2 hover:underline"
              onClick={() => handleUnhide(id, name)}
              title={`Restore "${name}" to library`}
            >
              <Eye className="size-3" />
              Unhide
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
