import { cn } from "@/lib/utils";
import { X } from "lucide-react";

const DEFAULT_TAG_COLOR = "#6B7280";

interface TagChipProps {
  name: string;
  color?: string | null;
  onRemove?: () => void;
  onClick?: () => void;
  size?: "sm" | "md";
  className?: string;
}

export function TagChip({
  name,
  color,
  onRemove,
  onClick,
  size = "md",
  className,
}: TagChipProps) {
  const tagColor = color || DEFAULT_TAG_COLOR;

  return (
    <span
      data-testid={`tag-chip-${name}`}
      className={cn(
        "group/chip inline-flex items-center gap-1 rounded-full font-medium transition-colors",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        onClick && "cursor-pointer hover:brightness-110",
        className,
      )}
      style={{
        backgroundColor: `${tagColor}20`,
        color: tagColor,
        borderWidth: 1,
        borderColor: `${tagColor}40`,
      }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {name}
      {onRemove && (
        <button
          data-testid={`tag-chip-remove-${name}`}
          className="ml-0.5 rounded-full p-0.5 opacity-60 transition-opacity group-hover/chip:opacity-100 hover:bg-white/10"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${name}`}
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}

export function TagDot({
  color,
  name,
}: {
  color?: string | null;
  name: string;
}) {
  return (
    <span
      className="inline-block size-2 rounded-full"
      style={{ backgroundColor: color || DEFAULT_TAG_COLOR }}
      title={name}
    />
  );
}
