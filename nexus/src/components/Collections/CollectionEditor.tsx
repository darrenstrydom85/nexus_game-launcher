import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { type Collection } from "@/stores/collectionStore";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const EMOJI_OPTIONS = ["📁", "🎮", "⭐", "❤️", "🏆", "🎯", "🔥", "💎", "🎲", "🗡️", "🧙", "🚀"];
const COLOR_OPTIONS = [null, "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#ec4899", "#06b6d4"];

interface CollectionEditorProps {
  open: boolean;
  onClose: () => void;
  editCollection?: Collection | null;
  existingNames?: string[];
  onSave: (data: { name: string; icon: string; color: string | null }) => void;
}

export function CollectionEditor({
  open,
  onClose,
  editCollection = null,
  existingNames = [],
  onSave,
}: CollectionEditorProps) {
  const [name, setName] = React.useState("");
  const [icon, setIcon] = React.useState("📁");
  const [color, setColor] = React.useState<string | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(editCollection?.name ?? "");
      setIcon(editCollection?.icon ?? "📁");
      setColor(editCollection?.color ?? null);
      setError("");
    }
  }, [open, editCollection]);

  const handleSave = React.useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    const isDuplicate = existingNames.some(
      (n) => n.toLowerCase() === trimmed.toLowerCase() && n !== editCollection?.name,
    );
    if (isDuplicate) {
      setError("A collection with this name already exists");
      return;
    }
    onSave({ name: trimmed, icon, color });
  }, [name, icon, color, existingNames, editCollection, onSave]);

  const inputClass = cn(
    "w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground",
    "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
  );

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="collection-editor"
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            data-testid="editor-backdrop"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            data-testid="editor-panel"
            className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">
                {editCollection ? "Edit Collection" : "New Collection"}
              </h2>
              <button
                data-testid="editor-close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Name</label>
                <input
                  data-testid="editor-name"
                  className={cn(inputClass, error && "border-destructive")}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(""); }}
                  placeholder="Collection name"
                />
                {error && (
                  <p data-testid="editor-name-error" className="mt-1 text-xs text-destructive">{error}</p>
                )}
              </div>

              {/* Icon picker */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Icon</label>
                <div data-testid="editor-icon-picker" className="flex flex-wrap gap-1.5">
                  {EMOJI_OPTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      data-testid={`icon-option-${emoji}`}
                      className={cn(
                        "flex size-9 items-center justify-center rounded-md text-lg transition-colors",
                        icon === emoji ? "bg-primary/20 ring-2 ring-primary" : "bg-secondary hover:bg-accent",
                      )}
                      onClick={() => setIcon(emoji)}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color picker */}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Accent Color</label>
                <div data-testid="editor-color-picker" className="flex gap-2">
                  {COLOR_OPTIONS.map((c, i) => (
                    <button
                      key={i}
                      data-testid={`color-option-${i}`}
                      className={cn(
                        "size-7 rounded-full border-2 transition-all",
                        color === c ? "border-foreground scale-110" : "border-transparent",
                      )}
                      style={{ background: c ?? "hsl(240, 5%, 15%)" }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button data-testid="editor-cancel" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button data-testid="editor-save" onClick={handleSave}>
                {editCollection ? "Save Changes" : "Create"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
