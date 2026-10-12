import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

import { open } from "@tauri-apps/plugin-dialog";
import { LibrarySection } from "@/modern/settings/sections/LibrarySection";
import { TagsSection } from "@/modern/settings/sections/TagsSection";
import { useSettingsStore } from "@/stores/settingsStore";
import { useGameStore, type Game } from "@/stores/gameStore";
import { useTagStore } from "@/stores/tagStore";
import { useToastStore } from "@/stores/toastStore";
import type { TagWithCount } from "@/lib/tauri";

function game(over: Partial<Game> & { id: string }): Game {
  return { name: over.id, source: "steam", status: "unset", folderPath: null, exePath: null, isHidden: false, coverUrl: null, ...over } as Game;
}

const games = [
  game({ id: "g1", source: "steam" }),
  game({ id: "g2", source: "steam" }),
  game({ id: "g3", source: "steam", status: "removed" }),
  game({ id: "g4", name: "Hollow Knight", source: "standalone", folderPath: "D:\\Games\\Hollow Knight" }),
  game({ id: "g5", source: "standalone", folderPath: "D:\\Games2\\Other" }),
];

const folder = { id: "f1", path: "D:\\Games", label: null, addedAt: "2026-01-01T00:00:00Z" };

let tagDb: TagWithCount[] = [];
const tag = (id: string, name: string, gameCount = 0, color: string | null = "#EF4444"): TagWithCount => ({ id, name, color, gameCount, createdAt: "" });

function backend(cmd: string, args?: Record<string, unknown>) {
  switch (cmd) {
    case "get_tags":
      return Promise.resolve(tagDb);
    case "create_tag": {
      const name = args?.name as string;
      if (tagDb.some((t) => t.name.toLowerCase() === name.toLowerCase())) return Promise.reject(new Error(`tag '${name}' already exists`));
      const t = tag(`t${tagDb.length + 1}`, name, 0, (args?.color as string | null) ?? null);
      tagDb = [...tagDb, t];
      return Promise.resolve(t);
    }
    case "delete_tag":
      tagDb = tagDb.filter((t) => t.id !== args?.tagId);
      return Promise.resolve();
    case "rename_tag":
      tagDb = tagDb.map((t) => (t.id === args?.tagId ? { ...t, name: args?.name as string } : t));
      return Promise.resolve();
    case "update_tag_color":
      tagDb = tagDb.map((t) => (t.id === args?.tagId ? { ...t, color: args?.color as string | null } : t));
      return Promise.resolve();
    case "add_watched_folder":
      return Promise.resolve({ id: "f2", path: args?.path, label: null, addedAt: "" });
    case "scan_sources":
      return Promise.resolve({
        games: [
          { name: "A", source: "steam" },
          { name: "B", source: "epic" },
          { name: "C", source: "standalone" },
        ],
        errors: [],
      });
    default:
      return Promise.resolve(null);
  }
}

beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(backend);
  tagDb = [];
  useGameStore.setState({ games });
  useSettingsStore.setState({
    sourcesEnabled: { steam: true, epic: false, gog: true, ubisoft: true, battlenet: true, xbox: true },
    watchedFolders: [folder],
    hiddenGameIds: [],
    defaultView: "grid",
    defaultSort: "name",
    autoStatusTransitions: true,
    continuePlayingEnabled: true,
    continuePlayingMax: 5,
    showCardProgress: true,
    retirementCeremonyEnabled: true,
    hltbHoursPerDay: 1.5,
    sessionNotePromptEnabled: true,
    sessionNotePromptTimeout: 60,
  });
  useTagStore.setState({ tags: [] });
});

describe("v1 settings: Library", () => {
  it("lists every source with its game count, ignoring removed games", () => {
    render(<LibrarySection />);
    const sources = screen.getByRole("region", { name: "Game sources" });
    expect(within(sources).getAllByRole("switch")).toHaveLength(7);
    expect(screen.getByTestId("source-toggle-steam")).toHaveAccessibleDescription("2 games");
    expect(screen.getByTestId("source-toggle-standalone")).toHaveAccessibleDescription("2 games");
    expect(within(sources).getAllByText("No games")).toHaveLength(5);
    // Standalone isn't in the saved map; it shows as on.
    expect(screen.getByTestId("source-toggle-standalone")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("source-toggle-epic")).toHaveAttribute("aria-checked", "false");
  });

  it("toggling a source calls the store setter and persists it", () => {
    render(<LibrarySection />);
    fireEvent.click(screen.getByTestId("source-toggle-steam"));
    expect(useSettingsStore.getState().sourcesEnabled.steam).toBe(false);
    expect(mockInvoke).toHaveBeenCalledWith("set_setting", { key: "source_steam_enabled", value: "false" });
    expect(screen.getByTestId("source-toggle-steam")).toHaveAttribute("aria-checked", "false");
  });

  it("re-scan keeps enabled sources, including standalone, and drops disabled ones", async () => {
    render(<LibrarySection />);
    fireEvent.click(screen.getByTestId("rescan-all"));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledWith("relink_play_sessions"));
    const confirm = mockInvoke.mock.calls.find(([cmd]) => cmd === "confirm_games");
    expect((confirm?.[1] as { detectedGames: { source: string }[] }).detectedGames.map((g) => g.source)).toEqual(["steam", "standalone"]);
    await waitFor(() => expect(screen.getByTestId("rescan-all")).not.toBeDisabled());
  });

  it("shows each watched folder with the standalone games inside it", () => {
    render(<LibrarySection />);
    const row = screen.getByTestId("folder-entry-f1");
    expect(row).toHaveTextContent("D:\\Games");
    // D:\Games2 is a different folder, not a child.
    expect(row).toHaveTextContent("1 game");
  });

  it("asks before removing a folder, and keeps it on cancel", async () => {
    render(<LibrarySection />);
    fireEvent.click(screen.getByTestId("folder-remove-f1"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Stop watching this folder?");
    expect(mockInvoke).not.toHaveBeenCalledWith("remove_watched_folder", expect.anything());

    fireEvent.click(within(dialog).getByTestId("confirm-cancel"));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(useSettingsStore.getState().watchedFolders).toHaveLength(1);

    fireEvent.click(screen.getByTestId("folder-remove-f1"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByTestId("confirm-action"));
    await waitFor(() => expect(useSettingsStore.getState().watchedFolders).toHaveLength(0));
    expect(mockInvoke).toHaveBeenCalledWith("remove_watched_folder", { id: "f1" });
  });

  it("adds a folder from the picker and skips duplicates", async () => {
    vi.mocked(open).mockResolvedValueOnce("E:\\Repacks").mockResolvedValueOnce("D:\\Games");
    render(<LibrarySection />);
    fireEvent.click(screen.getByTestId("add-folder-btn"));
    await waitFor(() => expect(useSettingsStore.getState().watchedFolders.map((f) => f.path)).toEqual(["D:\\Games", "E:\\Repacks"]));
    expect(mockInvoke).toHaveBeenCalledWith("add_watched_folder", { path: "E:\\Repacks" });

    mockInvoke.mockClear();
    fireEvent.click(screen.getByTestId("add-folder-btn"));
    await act(async () => {});
    expect(mockInvoke).not.toHaveBeenCalledWith("add_watched_folder", expect.anything());
  });

  it("preference controls update the store", () => {
    render(<LibrarySection />);
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(useSettingsStore.getState().defaultView).toBe("list");

    fireEvent.click(screen.getByTestId("pref-auto-status"));
    expect(useSettingsStore.getState().autoStatusTransitions).toBe(false);
    fireEvent.click(screen.getByTestId("pref-show-card-progress"));
    expect(useSettingsStore.getState().showCardProgress).toBe(false);
    fireEvent.click(screen.getByTestId("pref-retirement-ceremony-enabled"));
    expect(useSettingsStore.getState().retirementCeremonyEnabled).toBe(false);

    expect(screen.getByTestId("pref-continue-playing-max")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("pref-continue-playing-enabled"));
    expect(useSettingsStore.getState().continuePlayingEnabled).toBe(false);
    expect(screen.getByTestId("pref-continue-playing-max")).toBeDisabled();

    fireEvent.click(screen.getByTestId("pref-session-note-prompt-enabled"));
    expect(useSettingsStore.getState().sessionNotePromptEnabled).toBe(false);
    expect(screen.getByTestId("pref-session-note-prompt-timeout")).toBeDisabled();
  });

  it("selects show the stored values", () => {
    useSettingsStore.setState({ defaultSort: "lastPlayed", hltbHoursPerDay: 2.5, continuePlayingMax: 8, sessionNotePromptTimeout: 0 });
    render(<LibrarySection />);
    expect(screen.getByTestId("pref-default-sort")).toHaveTextContent("Recently played");
    expect(screen.getByTestId("pref-hltb-hours-per-day")).toHaveTextContent("2.5 hours a day");
    expect(screen.getByTestId("pref-continue-playing-max")).toHaveTextContent("8 games");
    expect(screen.getByTestId("pref-session-note-prompt-timeout")).toHaveTextContent("Never");
  });

  it("uses no native checkboxes or selects", () => {
    const { container } = render(<LibrarySection />);
    expect(container.querySelector("input[type=checkbox], select")).toBeNull();
  });
});

describe("v1 settings: Tags", () => {
  async function renderTags() {
    render(<TagsSection />);
    await act(async () => {});
  }

  it("shows an empty state, then creates a tag with a colour", async () => {
    await renderTags();
    expect(screen.getByText("No tags yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("tag-manager-create"));
    const submit = await screen.findByTestId("tag-form-submit");
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByTestId("tag-form-name"), { target: { value: "  Co-op  " } });
    fireEvent.click(screen.getByTestId("tag-colour-blue"));
    expect(screen.getByTestId("tag-colour-blue")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByTestId("tag-manager-row-Co-op")).toHaveTextContent("0 games"));
    expect(mockInvoke).toHaveBeenCalledWith("create_tag", { name: "Co-op", color: "#3B82F6" });
    expect(screen.queryByTestId("tag-form")).not.toBeInTheDocument();
  });

  it("keeps the form open with an error when the name is taken", async () => {
    tagDb = [tag("t1", "Co-op", 3)];
    await renderTags();
    fireEvent.click(screen.getByTestId("tag-manager-create"));
    fireEvent.change(await screen.findByTestId("tag-form-name"), { target: { value: "co-op" } });
    fireEvent.click(screen.getByTestId("tag-form-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("already exist");
    expect(screen.getByTestId("tag-form")).toBeInTheDocument();
  });

  it("edits a tag's name and colour", async () => {
    tagDb = [tag("t1", "Coop", 3)];
    await renderTags();
    expect(screen.getByTestId("tag-manager-row-Coop")).toHaveTextContent("3 games");
    fireEvent.click(screen.getByTestId("tag-edit-Coop"));
    const name = await screen.findByTestId("tag-form-name");
    expect(name).toHaveValue("Coop");
    expect(screen.getByTestId("tag-colour-red")).toHaveAttribute("aria-pressed", "true");
    fireEvent.change(name, { target: { value: "Co-op" } });
    fireEvent.click(screen.getByTestId("tag-colour-green"));
    fireEvent.click(screen.getByTestId("tag-form-submit"));

    await waitFor(() => expect(screen.getByTestId("tag-manager-row-Co-op")).toBeInTheDocument());
    expect(mockInvoke).toHaveBeenCalledWith("rename_tag", { tagId: "t1", name: "Co-op" });
    expect(mockInvoke).toHaveBeenCalledWith("update_tag_color", { tagId: "t1", color: "#22C55E" });
  });

  it("asks before deleting a tag", async () => {
    tagDb = [tag("t1", "Co-op", 3), tag("t2", "Backlog", 1)];
    await renderTags();
    fireEvent.click(screen.getByTestId("tag-delete-Co-op"));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete “Co-op”?");
    expect(dialog).toHaveTextContent("all 3 games");
    expect(mockInvoke).not.toHaveBeenCalledWith("delete_tag", expect.anything());

    fireEvent.click(within(dialog).getByTestId("confirm-action"));
    await waitFor(() => expect(screen.queryByTestId("tag-manager-row-Co-op")).not.toBeInTheDocument());
    expect(mockInvoke).toHaveBeenCalledWith("delete_tag", { tagId: "t1" });
    expect(screen.getByTestId("tag-manager-row-Backlog")).toBeInTheDocument();
  });

  it("says which step failed when the rename lands but the colour doesn't", async () => {
    tagDb = [tag("t1", "Coop", 3)];
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) =>
      cmd === "update_tag_color" ? Promise.reject(new Error("locked")) : backend(cmd, args),
    );
    await renderTags();
    fireEvent.click(screen.getByTestId("tag-edit-Coop"));
    fireEvent.change(await screen.findByTestId("tag-form-name"), { target: { value: "Co-op" } });
    fireEvent.click(screen.getByTestId("tag-colour-green"));
    fireEvent.click(screen.getByTestId("tag-form-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Renamed, but couldn’t change the colour. Please try again.");
    expect(screen.getByTestId("tag-form")).toBeInTheDocument();
    expect(screen.getByTestId("tag-manager-row-Co-op")).toBeInTheDocument();
  });

  it("keeps the tag and says so when deleting it fails", async () => {
    useToastStore.setState({ toasts: [] });
    tagDb = [tag("t1", "Co-op", 3)];
    mockInvoke.mockImplementation((cmd: string, args?: Record<string, unknown>) =>
      cmd === "delete_tag" ? Promise.reject(new Error("locked")) : backend(cmd, args),
    );
    await renderTags();
    fireEvent.click(screen.getByTestId("tag-delete-Co-op"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByTestId("confirm-action"));

    await waitFor(() =>
      expect(useToastStore.getState().toasts[0]).toMatchObject({ type: "error", message: "Couldn’t delete “Co-op”. Please try again." }),
    );
    expect(screen.getByTestId("tag-manager-row-Co-op")).toBeInTheDocument();
  });
});
