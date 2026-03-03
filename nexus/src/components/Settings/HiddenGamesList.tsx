import * as React from "react";
import { Gamepad2, Eye } from "lucide-react";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore } from "@/stores/gameStore";
import { useToastStore } from "@/stores/toastStore";

export function HiddenGamesList() {
  const hiddenGameIds = useSettingsStore((s) => s.hiddenGameIds);
  const unhideGame = useSettingsStore((s) => s.unhideGame);
  const games = useGameStore((s) => s.games);
  const addToast = useToastStore((s) => s.addToast);

  const hiddenGames = React.useMemo(() => {
    return hiddenGameIds
      .map((id) => {
        const game = games.find((g) => g.id === id);
        return { id, name: game?.name ?? "Unknown Game", coverUrl: game?.coverUrl ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [hiddenGameIds, games]);

  if (hiddenGames.length === 0) return null;

  function handleUnhide(id: string, name: string) {
    unhideGame(id);
    addToast({ type: "success", message: `"${name}" restored to library` });
  }

  function handleUnhideAll() {
    hiddenGameIds.forEach((id) => unhideGame(id));
    addToast({ type: "success", message: "All hidden games restored" });
  }

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
