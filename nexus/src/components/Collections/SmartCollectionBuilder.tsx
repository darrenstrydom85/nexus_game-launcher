import * as React from "react";
import { cn } from "@/lib/utils";
import { Plus, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RuleConditionRow } from "./RuleConditionRow";
import {
  PresetSmartCollections,
  type SmartCollectionPreset,
} from "./PresetSmartCollections";
import { evaluateSmartCollection } from "@/lib/tauri";
import type {
  SmartCollectionRule,
  SmartCollectionRuleGroup,
} from "@/lib/tauri";

interface SmartCollectionBuilderProps {
  rules: SmartCollectionRuleGroup;
  onChange: (rules: SmartCollectionRuleGroup) => void;
  onPresetSelect?: (preset: SmartCollectionPreset) => void;
  showPresets?: boolean;
}

const DEFAULT_RULE: SmartCollectionRule = {
  field: "status",
  op: "equals",
  value: "backlog",
};

export function SmartCollectionBuilder({
  rules,
  onChange,
  onPresetSelect,
  showPresets = false,
}: SmartCollectionBuilderProps) {
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);

  const conditions = rules.conditions as SmartCollectionRule[];

  const handleOperatorToggle = React.useCallback(() => {
    onChange({
      ...rules,
      operator: rules.operator === "and" ? "or" : "and",
    });
  }, [rules, onChange]);

  const handleAddCondition = React.useCallback(() => {
    onChange({
      ...rules,
      conditions: [...rules.conditions, { ...DEFAULT_RULE }],
    });
  }, [rules, onChange]);

  const handleUpdateCondition = React.useCallback(
    (index: number, updated: SmartCollectionRule) => {
      const next = [...rules.conditions];
      next[index] = updated;
      onChange({ ...rules, conditions: next });
    },
    [rules, onChange],
  );

  const handleRemoveCondition = React.useCallback(
    (index: number) => {
      const next = rules.conditions.filter((_, i) => i !== index);
      onChange({ ...rules, conditions: next });
      setPreviewCount(null);
    },
    [rules, onChange],
  );

  const handlePreview = React.useCallback(async () => {
    setPreviewLoading(true);
    try {
      const json = JSON.stringify(rules);
      const ids = await evaluateSmartCollection(json);
      setPreviewCount(ids.length);
    } catch {
      setPreviewCount(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [rules]);

  return (
    <div className="flex flex-col gap-3">
      {/* AND/OR toggle */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Match</span>
        <button
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            rules.operator === "and"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-accent",
          )}
          onClick={() => rules.operator !== "and" && handleOperatorToggle()}
        >
          ALL
        </button>
        <button
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium transition-colors",
            rules.operator === "or"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-accent",
          )}
          onClick={() => rules.operator !== "or" && handleOperatorToggle()}
        >
          ANY
        </button>
        <span className="text-sm text-muted-foreground">of the following</span>
      </div>

      {/* Conditions list */}
      <div className="flex flex-col gap-2">
        {conditions.map((rule, i) => (
          <RuleConditionRow
            key={i}
            rule={rule}
            onChange={(updated) => handleUpdateCondition(i, updated)}
            onRemove={() => handleRemoveCondition(i)}
          />
        ))}
      </div>

      {/* Add condition + Preview */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAddCondition}
          className="gap-1.5"
        >
          <Plus className="size-3.5" />
          Add Condition
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={handlePreview}
          disabled={previewLoading || conditions.length === 0}
          className="gap-1.5"
        >
          <Eye className="size-3.5" />
          {previewLoading ? "Checking..." : "Preview"}
        </Button>

        {previewCount !== null && (
          <span className="text-sm tabular-nums text-muted-foreground">
            {previewCount} game{previewCount !== 1 ? "s" : ""} match
          </span>
        )}
      </div>

      {/* Presets */}
      {showPresets && onPresetSelect && (
        <div className="mt-2 border-t border-border pt-3">
          <PresetSmartCollections onSelect={onPresetSelect} />
        </div>
      )}
    </div>
  );
}
