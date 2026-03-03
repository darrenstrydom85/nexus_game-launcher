import { useSettingsStore } from "@/stores/settingsStore";
import { HiddenGamesList } from "./HiddenGamesList";

export function LibraryPreferences() {
  const autoStatus = useSettingsStore((s) => s.autoStatusTransitions);
  const setAutoStatus = useSettingsStore((s) => s.setAutoStatusTransitions);
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const setDefaultSort = useSettingsStore((s) => s.setDefaultSort);
  const defaultView = useSettingsStore((s) => s.defaultView);
  const setDefaultView = useSettingsStore((s) => s.setDefaultView);

  return (
    <section data-testid="library-preferences">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Library</h3>
      <div className="flex flex-col gap-3">
        <label className="flex items-center justify-between">
          <span className="text-sm text-foreground">Default Sort</span>
          <select
            data-testid="pref-default-sort"
            className="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
            value={defaultSort}
            onChange={(e) => setDefaultSort(e.target.value)}
          >
            <option value="name">Name</option>
            <option value="lastPlayed">Recently Played</option>
            <option value="totalPlayTime">Most Played</option>
            <option value="addedAt">Recently Added</option>
            <option value="rating">Rating</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-foreground">Default View</span>
          <select
            data-testid="pref-default-view"
            className="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground"
            value={defaultView}
            onChange={(e) => setDefaultView(e.target.value as "grid" | "list")}
          >
            <option value="grid">Grid</option>
            <option value="list">List</option>
          </select>
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm text-foreground">Auto-status transitions</span>
          <input
            data-testid="pref-auto-status"
            type="checkbox"
            checked={autoStatus}
            onChange={() => setAutoStatus(!autoStatus)}
            className="size-4 rounded border-border"
          />
        </label>
        <HiddenGamesList />
      </div>
    </section>
  );
}
