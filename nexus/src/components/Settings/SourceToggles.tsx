import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "@/stores/settingsStore";
import { refreshGames, type GameSource } from "@/stores/gameStore";
import { SOURCE_ICON_COMPONENTS, SOURCE_LABELS } from "@/lib/source-icons";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";

const SOURCE_IDS: GameSource[] = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox", "standalone"];

interface ScanResult {
  games: { name: string; source: string; sourceId: string | null; sourceHint: string | null; folderPath: string | null; exePath: string | null; exeName: string | null; launchUrl: string | null }[];
  errors: { source: string; message: string }[];
}

export function SourceToggles() {
  const sourcesEnabled = useSettingsStore((s) => s.sourcesEnabled);
  const setSourceEnabled = useSettingsStore((s) => s.setSourceEnabled);
  const [rescanning, setRescanning] = React.useState(false);

  const handleToggle = React.useCallback(
    (sourceId: string) => {
      const current = sourcesEnabled[sourceId] ?? true;
      setSourceEnabled(sourceId, !current);
    },
    [sourcesEnabled, setSourceEnabled],
  );

  const handleRescan = React.useCallback(async () => {
    setRescanning(true);
    try {
      const result = await invoke<ScanResult>("scan_sources");
      const enabledSet = new Set(
        Object.entries(sourcesEnabled)
          .filter(([, v]) => v)
          .map(([k]) => k),
      );
      const filtered = result.games.filter((g) => enabledSet.has(g.source));
      if (filtered.length > 0) {
        await invoke("confirm_games", { detectedGames: filtered });
        await invoke("relink_play_sessions");
      }
      await refreshGames();
    } catch {
      // best-effort
    } finally {
      setRescanning(false);
    }
  }, [sourcesEnabled]);

  return (
    <section data-testid="source-toggles">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Game Sources</h3>
        <Button
          data-testid="rescan-all"
          variant="ghost"
          size="xs"
          className="gap-1 text-xs"
          disabled={rescanning}
          onClick={handleRescan}
        >
          {rescanning ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <RefreshCw className="size-3" />
          )}
          {rescanning ? "Scanning..." : "Re-scan all"}
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        {SOURCE_IDS.map((id) => {
          const IconComponent = SOURCE_ICON_COMPONENTS[id];
          return (
            <label
              key={id}
              data-testid={`source-toggle-${id}`}
              className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/50"
            >
              <IconComponent className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-sm text-foreground">{SOURCE_LABELS[id]}</span>
              <input
                type="checkbox"
                data-testid={`source-check-${id}`}
                checked={sourcesEnabled[id] ?? true}
                onChange={() => handleToggle(id)}
                className="size-4 rounded border-border"
              />
            </label>
          );
        })}
      </div>
    </section>
  );
}
