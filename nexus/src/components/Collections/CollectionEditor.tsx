import * as React from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "motion/react";
import { type Collection } from "@/stores/collectionStore";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { SmartCollectionBuilder } from "./SmartCollectionBuilder";
import type { SmartCollectionPreset } from "./PresetSmartCollections";
import type { SmartCollectionRuleGroup } from "@/lib/tauri";

const EMOJI_OPTIONS = ["📁", "🎮", "⭐", "❤️", "🏆", "🎯", "🔥", "💎", "🎲", "🗡️", "🧙", "🚀"];
const COLOR_OPTIONS = [null, "#3b82f6", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#ec4899", "#06b6d4"];

const EMPTY_RULES: SmartCollectionRuleGroup = {
  operator: "and",
  conditions: [{ field: "status", op: "equals", value: "backlog" }],
};

interface CollectionEditorProps {
  open: boolean;
  onClose: () => void;
  editCollection?: Collection | null;
  existingNames?: string[];
  onSave: (data: {
    name: string;
    icon: string;
    color: string | null;
    isSmart: boolean;
    rulesJson: string | null;
  }) => void;
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
  const [isSmart, setIsSmart] = React.useState(false);
  const [rules, setRules] = React.useState<SmartCollectionRuleGroup>(EMPTY_RULES);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setName(editCollection?.name ?? "");
      setIcon(editCollection?.icon ?? "📁");
      setColor(editCollection?.color ?? null);
      setIsSmart(editCollection?.isSmart ?? false);
      setError("");

      if (editCollection?.rulesJson) {
        try {
          setRules(JSON.parse(editCollection.rulesJson));
        } catch {
          setRules(EMPTY_RULES);
        }
      } else {
        setRules(EMPTY_RULES);
      }
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

    if (isSmart && rules.conditions.length === 0) {
      setError("Smart collections need at least one condition");
      return;
    }

    onSave({
      name: trimmed,
      icon,
      color,
      isSmart,
      rulesJson: isSmart ? JSON.stringify(rules) : null,
    });
  }, [name, icon, color, isSmart, rules, existingNames, editCollection, onSave]);

  const handlePresetSelect = React.useCallback(
    (preset: SmartCollectionPreset) => {
      setName(preset.name);
      setIcon(preset.icon);
      setRules(preset.rules);
    },
    [],
  );

  const isEditing = !!editCollection;
  const canToggleType = !isEditing;

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
            className={cn(
              "relative z-10 flex w-full max-h-[85vh] flex-col rounded-xl border border-border bg-card shadow-2xl",
              isSmart ? "max-w-lg" : "max-w-md",
            )}
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.95 }}
          >
            {/* Fixed header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {isEditing
                  ? editCollection.isSmart
                    ? "Edit Smart Collection"
                    : "Edit Collection"
                  : "New Collection"}
              </h2>
              <button
                data-testid="editor-close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6">
              <div className="flex flex-col gap-4">
                {/* Manual / Smart toggle */}
                {canToggleType && (
                  <div className="flex gap-2">
                    <button
                      data-testid="type-manual"
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        !isSmart
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-accent",
                      )}
                      onClick={() => setIsSmart(false)}
                    >
                      Manual
                    </button>
                    <button
                      data-testid="type-smart"
                      className={cn(
                        "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isSmart
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:bg-accent",
                      )}
                      onClick={() => setIsSmart(true)}
                    >
                      Smart
                    </button>
                  </div>
                )}

                {/* Name */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Name</label>
                  <input
                    data-testid="editor-name"
                    className={cn(inputClass, error && "border-destructive")}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setError("");
                    }}
                    placeholder="Collection name"
                  />
                  {error && (
                    <p data-testid="editor-name-error" className="mt-1 text-xs text-destructive">
                      {error}
                    </p>
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
                          icon === emoji
                            ? "bg-primary/20 ring-2 ring-primary"
                            : "bg-secondary hover:bg-accent",
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
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Accent Color
                  </label>
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

                {/* Smart collection builder */}
                {isSmart && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-foreground">
                      Rules
                    </label>
                    <SmartCollectionBuilder
                      rules={rules}
                      onChange={setRules}
                      showPresets={!isEditing}
                      onPresetSelect={handlePresetSelect}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Fixed footer */}
            <div className="flex justify-end gap-2 px-6 pt-4 pb-6">
              <Button data-testid="editor-cancel" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button data-testid="editor-save" onClick={handleSave}>
                {isEditing ? "Save Changes" : "Create"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
