import { useSettingsStore } from "@/stores/settingsStore";
import { HiddenGamesList } from "./HiddenGamesList";

export function LibraryPreferences() {
  const autoStatus = useSettingsStore((s) => s.autoStatusTransitions);
  const setAutoStatus = useSettingsStore((s) => s.setAutoStatusTransitions);
  const defaultSort = useSettingsStore((s) => s.defaultSort);
  const setDefaultSort = useSettingsStore((s) => s.setDefaultSort);
  const defaultView = useSettingsStore((s) => s.defaultView);
  const setDefaultView = useSettingsStore((s) => s.setDefaultView);
  const cpEnabled = useSettingsStore((s) => s.continuePlayingEnabled);
  const setCpEnabled = useSettingsStore((s) => s.setContinuePlayingEnabled);
  const cpMax = useSettingsStore((s) => s.continuePlayingMax);
  const setCpMax = useSettingsStore((s) => s.setContinuePlayingMax);
  const notePromptEnabled = useSettingsStore((s) => s.sessionNotePromptEnabled);
  const setNotePromptEnabled = useSettingsStore((s) => s.setSessionNotePromptEnabled);
  const notePromptTimeout = useSettingsStore((s) => s.sessionNotePromptTimeout);
  const setNotePromptTimeout = useSettingsStore((s) => s.setSessionNotePromptTimeout);

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

        {/* Continue Playing preferences */}
        <div className="mt-1 border-t border-border pt-3">
          <span className="mb-2 block text-xs font-medium text-muted-foreground">
            Continue Playing
          </span>
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between">
              <span className="text-sm text-foreground">Show Continue Playing row</span>
              <input
                data-testid="pref-continue-playing-enabled"
                type="checkbox"
                checked={cpEnabled}
                onChange={() => setCpEnabled(!cpEnabled)}
                className="size-4 rounded border-border"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-foreground">Max games shown</span>
              <select
                data-testid="pref-continue-playing-max"
                className="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground disabled:opacity-50"
                value={cpMax}
                onChange={(e) => setCpMax(Number(e.target.value))}
                disabled={!cpEnabled}
              >
                <option value={3}>3</option>
                <option value={5}>5</option>
                <option value={8}>8</option>
              </select>
            </label>
          </div>
        </div>

        {/* Session Notes preferences */}
        <div className="mt-1 border-t border-border pt-3">
          <span className="mb-2 block text-xs font-medium text-muted-foreground">
            Session Notes
          </span>
          <div className="flex flex-col gap-3">
            <label className="flex items-center justify-between">
              <span className="text-sm text-foreground">Post-session note prompt</span>
              <input
                data-testid="pref-session-note-prompt-enabled"
                type="checkbox"
                checked={notePromptEnabled}
                onChange={() => setNotePromptEnabled(!notePromptEnabled)}
                className="size-4 rounded border-border"
              />
            </label>
            <label className="flex items-center justify-between">
              <span className="text-sm text-foreground">Auto-dismiss timeout</span>
              <select
                data-testid="pref-session-note-prompt-timeout"
                className="rounded-md border border-border bg-input px-2 py-1 text-sm text-foreground disabled:opacity-50"
                value={notePromptTimeout}
                onChange={(e) => setNotePromptTimeout(Number(e.target.value))}
                disabled={!notePromptEnabled}
              >
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
                <option value={90}>90 seconds</option>
                <option value={0}>Never</option>
              </select>
            </label>
          </div>
        </div>

        <HiddenGamesList />
      </div>
    </section>
  );
}
