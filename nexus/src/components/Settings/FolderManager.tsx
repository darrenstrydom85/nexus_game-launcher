import * as React from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore, type WatchedFolder } from "@/stores/settingsStore";
import { Button } from "@/components/ui/button";
import { FolderPlus, X, RefreshCw } from "lucide-react";

export function FolderManager() {
  const folders = useSettingsStore((s) => s.watchedFolders);
  const addFolder = useSettingsStore((s) => s.addWatchedFolder);
  const removeFolder = useSettingsStore((s) => s.removeWatchedFolder);

  const handleAddFolder = React.useCallback(async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select a game folder",
    });
    if (!selected) return;
    const path = selected as string;
    if (folders.some((f) => f.path === path)) return;
    try {
      const folder = await invoke<WatchedFolder>("add_watched_folder", { path });
      addFolder(folder);
    } catch {
      // duplicate or DB error — silently ignore
    }
  }, [folders, addFolder]);

  const handleRemoveFolder = React.useCallback(
    async (id: string) => {
      try {
        await invoke("remove_watched_folder", { id });
      } catch {
        // best-effort
      }
      removeFolder(id);
    },
    [removeFolder],
  );

  const handleScanFolder = React.useCallback(async (path: string) => {
    try {
      await invoke("scan_directory", { path });
    } catch {
      // best-effort
    }
  }, []);

  return (
    <section data-testid="folder-manager">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Watched Folders</h3>
      <div className="flex flex-col gap-1">
        {folders.map((folder) => (
          <div
            key={folder.id}
            data-testid={`folder-entry-${folder.id}`}
            className="flex items-center gap-2 rounded-md bg-secondary/30 px-3 py-1.5"
          >
            <code className="flex-1 truncate text-xs text-muted-foreground">{folder.path}</code>
            <button
              data-testid={`folder-scan-${folder.id}`}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Scan ${folder.path}`}
              onClick={() => handleScanFolder(folder.path)}
            >
              <RefreshCw className="size-3.5" />
            </button>
            <button
              data-testid={`folder-remove-${folder.id}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => handleRemoveFolder(folder.id)}
              aria-label={`Remove ${folder.path}`}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <Button
        data-testid="add-folder-btn"
        variant="secondary"
        size="sm"
        className="mt-2 gap-1"
        onClick={handleAddFolder}
      >
        <FolderPlus className="size-4" /> Add Folder
      </Button>
    </section>
  );
}
