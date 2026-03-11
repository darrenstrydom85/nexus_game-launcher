import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useTagStore } from "@/stores/tagStore";
import type {
  SmartRuleField,
  SmartRuleOperator,
  SmartCollectionRule,
} from "@/lib/tauri";

const FIELD_OPTIONS: { value: SmartRuleField; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "source", label: "Source" },
  { value: "genre", label: "Genre" },
  { value: "tag", label: "Tag" },
  { value: "rating", label: "Rating" },
  { value: "totalPlayTime", label: "Play Time (seconds)" },
  { value: "playCount", label: "Play Count" },
  { value: "lastPlayed", label: "Last Played" },
  { value: "addedAt", label: "Added Date" },
  { value: "hltbMainH", label: "HLTB Main (hours)" },
  { value: "criticScore", label: "Critic Score" },
  { value: "isHidden", label: "Hidden" },
];

const OPERATORS_BY_FIELD: Record<SmartRuleField, { value: SmartRuleOperator; label: string }[]> = {
  status: [
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
  ],
  source: [
    { value: "equals", label: "is" },
    { value: "not_equals", label: "is not" },
    { value: "in", label: "is one of" },
  ],
  genre: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
  ],
  tag: [
    { value: "has", label: "has tag" },
    { value: "not_has", label: "does not have tag" },
  ],
  rating: [
    { value: "equals", label: "equals" },
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "between", label: "between" },
  ],
  totalPlayTime: [
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "between", label: "between" },
  ],
  playCount: [
    { value: "equals", label: "equals" },
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
  ],
  lastPlayed: [
    { value: "within_days", label: "within last N days" },
    { value: "before_days_ago", label: "more than N days ago" },
    { value: "never", label: "never played" },
  ],
  addedAt: [
    { value: "within_days", label: "within last N days" },
    { value: "before_days_ago", label: "more than N days ago" },
  ],
  hltbMainH: [
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "between", label: "between" },
  ],
  criticScore: [
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "between", label: "between" },
  ],
  isHidden: [{ value: "equals", label: "is" }],
};

const STATUS_OPTIONS = ["backlog", "playing", "completed", "dropped", "wishlist"];
const SOURCE_OPTIONS = ["steam", "epic", "gog", "ubisoft", "battlenet", "xbox", "standalone"];

interface RuleConditionRowProps {
  rule: SmartCollectionRule;
  onChange: (rule: SmartCollectionRule) => void;
  onRemove: () => void;
}

const selectClass = cn(
  "rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground",
  "focus:outline-none focus:ring-2 focus:ring-ring",
);

const inputClass = cn(
  "w-20 rounded-md border border-border bg-input px-2 py-1.5 text-sm text-foreground",
  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
);

export function RuleConditionRow({ rule, onChange, onRemove }: RuleConditionRowProps) {
  const tags = useTagStore((s) => s.tags);

  const handleFieldChange = React.useCallback(
    (field: SmartRuleField) => {
      const ops = OPERATORS_BY_FIELD[field];
      const defaultOp = ops[0].value;
      let defaultValue: unknown = "";

      if (field === "status") defaultValue = STATUS_OPTIONS[0];
      else if (field === "source") defaultValue = SOURCE_OPTIONS[0];
      else if (field === "isHidden") defaultValue = false;
      else if (field === "lastPlayed" && defaultOp === "never") defaultValue = null;
      else if (field === "tag") defaultValue = tags[0]?.id ?? "";
      else defaultValue = 0;

      onChange({ field, op: defaultOp, value: defaultValue });
    },
    [onChange, tags],
  );

  const handleOpChange = React.useCallback(
    (op: SmartRuleOperator) => {
      let newValue = rule.value;
      if (op === "never") newValue = null;
      else if (op === "between") newValue = [0, 100];
      else if (op === "in" && !Array.isArray(rule.value)) newValue = [rule.value];
      onChange({ ...rule, op, value: newValue });
    },
    [rule, onChange],
  );

  const operators = OPERATORS_BY_FIELD[rule.field] ?? [];

  return (
    <div className="flex items-center gap-2 rounded-lg bg-card/60 px-3 py-2">
      {/* Field */}
      <select
        className={selectClass}
        value={rule.field}
        onChange={(e) => handleFieldChange(e.target.value as SmartRuleField)}
      >
        {FIELD_OPTIONS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Operator */}
      <select
        className={selectClass}
        value={rule.op}
        onChange={(e) => handleOpChange(e.target.value as SmartRuleOperator)}
      >
        {operators.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* Value input */}
      <ValueInput rule={rule} onChange={onChange} tags={tags} />

      {/* Remove */}
      <button
        className="ml-auto rounded-md p-1 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        aria-label="Remove condition"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function ValueInput({
  rule,
  onChange,
  tags,
}: {
  rule: SmartCollectionRule;
  onChange: (r: SmartCollectionRule) => void;
  tags: { id: string; name: string }[];
}) {
  const { field, op, value } = rule;

  if (op === "never") return null;

  if (field === "status") {
    return (
      <select
        className={selectClass}
        value={String(value ?? "")}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
    );
  }

  if (field === "source" && op !== "in") {
    return (
      <select
        className={selectClass}
        value={String(value ?? "")}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      >
        {SOURCE_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </option>
        ))}
      </select>
    );
  }

  if (field === "source" && op === "in") {
    const selected = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="flex flex-wrap gap-1">
        {SOURCE_OPTIONS.map((s) => {
          const isActive = selected.includes(s);
          return (
            <button
              key={s}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-accent",
              )}
              onClick={() => {
                const next = isActive
                  ? selected.filter((v) => v !== s)
                  : [...selected, s];
                onChange({ ...rule, value: next });
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
    );
  }

  if (field === "tag") {
    return (
      <select
        className={selectClass}
        value={String(value ?? "")}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      >
        {tags.length === 0 && <option value="">No tags available</option>}
        {tags.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  }

  if (field === "isHidden") {
    return (
      <select
        className={selectClass}
        value={value === true ? "true" : "false"}
        onChange={(e) => onChange({ ...rule, value: e.target.value === "true" })}
      >
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (op === "between") {
    const arr = Array.isArray(value) ? (value as number[]) : [0, 100];
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          className={inputClass}
          value={arr[0] ?? 0}
          onChange={(e) =>
            onChange({ ...rule, value: [Number(e.target.value), arr[1] ?? 100] })
          }
        />
        <span className="text-xs text-muted-foreground">and</span>
        <input
          type="number"
          className={inputClass}
          value={arr[1] ?? 100}
          onChange={(e) =>
            onChange({ ...rule, value: [arr[0] ?? 0, Number(e.target.value)] })
          }
        />
      </div>
    );
  }

  if (field === "genre") {
    return (
      <input
        type="text"
        className={cn(inputClass, "w-32")}
        placeholder="e.g. RPG"
        value={String(value ?? "")}
        onChange={(e) => onChange({ ...rule, value: e.target.value })}
      />
    );
  }

  return (
    <input
      type="number"
      className={inputClass}
      value={Number(value ?? 0)}
      onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })}
    />
  );
}
