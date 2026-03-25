import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { cn } from "@/lib/utils";
import type { Game } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { X, RotateCcw, FolderOpen } from "lucide-react";

interface EditGameModalProps {
  game: Game | null;
  open: boolean;
  onClose: () => void;
  onSave: (updates: EditGameFields) => void;
}

export interface EditGameFields {
  name: string;
  exePath: string;
  customCover: string | null;
  customHero: string | null;
  potentialExeNames: string | null;
}

export function EditGameModal({ game, open, onClose, onSave }: EditGameModalProps) {
  const [name, setName] = React.useState("");
  const [exePath, setExePath] = React.useState("");
  const [customCover, setCustomCover] = React.useState<string | null>(null);
  const [customHero, setCustomHero] = React.useState<string | null>(null);
  const [potentialExeNames, setPotentialExeNames] = React.useState<string>("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (game && open) {
      setName(game.name);
      setExePath(game.exePath ?? "");
      setCustomCover(game.customCover ?? null);
      setCustomHero(game.customHero ?? null);
      setPotentialExeNames(game.potentialExeNames ?? "");
      setErrors({});
    }
  }, [game, open]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const validate = React.useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!name.trim()) newErrors.name = "Name is required";
    if (exePath && !exePath.match(/\.(exe|bat|cmd|sh|app)$/i)) {
      newErrors.exePath = "Must be a valid executable file";
    }
    if (customCover && customCover.trim().length === 0) {
      newErrors.customCover = "Must be a valid URL or file path";
    }
    if (customHero && customHero.trim().length === 0) {
      newErrors.customHero = "Must be a valid URL or file path";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [name, exePath, customCover, customHero]);

  const handleSave = React.useCallback(() => {
    if (!validate()) return;
    onSave({
      name: name.trim(),
      exePath,
      customCover,
      customHero,
      potentialExeNames: potentialExeNames.trim() || null,
    });
  }, [validate, onSave, name, exePath, customCover, customHero, potentialExeNames]);

  const handleReset = React.useCallback(() => {
    if (!game) return;
    setName(game.name);
    setExePath(game.exePath ?? "");
    setCustomCover(game.customCover ?? null);
    setCustomHero(game.customHero ?? null);
    setPotentialExeNames(game.potentialExeNames ?? "");
    setErrors({});
  }, [game]);

  const browseExe = React.useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      defaultPath: game?.folderPath ?? undefined,
      filters: [{ name: "Executable", extensions: ["exe", "bat", "cmd", "sh", "app"] }],
    });
    if (selected && typeof selected === "string") setExePath(selected);
  }, [game?.folderPath]);

  const browseCover = React.useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (selected && typeof selected === "string") setCustomCover(selected);
  }, []);

  const browseHero = React.useCallback(async () => {
    const selected = await openDialog({
      multiple: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (selected && typeof selected === "string") setCustomHero(selected);
  }, []);

  const browseButtonClass = cn(
    "flex-none rounded-md border border-border bg-input p-2 text-muted-foreground",
    "hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  );

  const inputClass = cn(
    "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground",
    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  );

  return (
    <AnimatePresence>
      {open && game && (
        <motion.div
          data-testid="edit-game-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            data-testid="edit-modal-backdrop"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            data-testid="edit-modal-panel"
            className="relative z-10 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Edit Game</h2>
              <button
                data-testid="edit-modal-close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label htmlFor="edit-name" className="mb-1 block text-sm font-medium text-foreground">
                  Game Name
                </label>
                <input
                  id="edit-name"
                  data-testid="edit-name"
                  className={cn(inputClass, errors.name && "border-destructive")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {errors.name && (
                  <p data-testid="edit-name-error" className="mt-1 text-xs text-destructive">
                    {errors.name}
                  </p>
                )}
              </div>

              {/* Exe Path */}
              <div>
                <label htmlFor="edit-exe" className="mb-1 block text-sm font-medium text-foreground">
                  Executable Path
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="edit-exe"
                    data-testid="edit-exe"
                    className={cn(inputClass, errors.exePath && "border-destructive")}
                    value={exePath}
                    onChange={(e) => setExePath(e.target.value)}
                    placeholder="C:\Games\game.exe"
                  />
                  <button
                    type="button"
                    data-testid="edit-exe-browse"
                    className={browseButtonClass}
                    onClick={browseExe}
                    aria-label="Browse for executable"
                    title="Browse"
                  >
                    <FolderOpen className="size-4" />
                  </button>
                </div>
                {errors.exePath && (
                  <p data-testid="edit-exe-error" className="mt-1 text-xs text-destructive">
                    {errors.exePath}
                  </p>
                )}
              </div>

              {/* Custom Cover */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Custom Cover Art
                </label>
                <div className="flex items-center gap-2">
                  {(customCover || game.coverUrl) && (
                    <div data-testid="edit-cover-preview" className="size-16 flex-none overflow-hidden rounded-lg">
                      <img
                        src={customCover ?? game.coverUrl ?? ""}
                        alt="Cover preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  )}
                  <input
                    data-testid="edit-cover-input"
                    className={inputClass}
                    value={customCover ?? ""}
                    onChange={(e) => setCustomCover(e.target.value || null)}
                    placeholder="https://... or C:\path\to\cover.png"
                  />
                  <button
                    type="button"
                    data-testid="edit-cover-browse"
                    className={browseButtonClass}
                    onClick={browseCover}
                    aria-label="Browse for cover image"
                    title="Browse"
                  >
                    <FolderOpen className="size-4" />
                  </button>
                </div>
                {errors.customCover && (
                  <p data-testid="edit-cover-error" className="mt-1 text-xs text-destructive">
                    {errors.customCover}
                  </p>
                )}
              </div>

              {/* Custom Hero */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Custom Hero Art
                </label>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="edit-hero-input"
                    className={cn(inputClass, errors.customHero && "border-destructive")}
                    value={customHero ?? ""}
                    onChange={(e) => setCustomHero(e.target.value || null)}
                    placeholder="https://... or C:\path\to\hero.png"
                  />
                  <button
                    type="button"
                    data-testid="edit-hero-browse"
                    className={browseButtonClass}
                    onClick={browseHero}
                    aria-label="Browse for hero image"
                    title="Browse"
                  >
                    <FolderOpen className="size-4" />
                  </button>
                </div>
                {errors.customHero && (
                  <p data-testid="edit-hero-error" className="mt-1 text-xs text-destructive">
                    {errors.customHero}
                  </p>
                )}
              </div>

              {/* Process Tracking */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Process Names
                </label>
                <input
                  data-testid="edit-potential-exe-names"
                  className={inputClass}
                  value={potentialExeNames}
                  onChange={(e) => setPotentialExeNames(e.target.value)}
                  placeholder="game.exe, game_launcher.exe"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Comma-separated exe filenames used to detect when the game is running
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-between">
              <button
                data-testid="edit-reset"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
                onClick={handleReset}
              >
                <RotateCcw className="size-3.5" />
                Reset to detected
              </button>
              <div className="flex gap-2">
                <Button
                  data-testid="edit-cancel"
                  variant="secondary"
                  onClick={onClose}
                >
                  Cancel
                </Button>
                <Button
                  data-testid="edit-save"
                  onClick={handleSave}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
