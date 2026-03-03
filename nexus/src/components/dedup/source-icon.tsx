import type { GameSource } from "@/stores/gameStore";
import { cn } from "@/lib/utils";

const SOURCE_COLORS: Record<GameSource, string> = {
  steam: "bg-[#1b2838] text-[#66c0f4]",
  epic: "bg-[#2a2a2a] text-white",
  gog: "bg-[#4a1e6a] text-white",
  ubisoft: "bg-[#0070ff] text-white",
  battlenet: "bg-[#00aeff] text-white",
  xbox: "bg-[#107c10] text-white",
  standalone: "bg-muted text-muted-foreground",
};

const SOURCE_LABELS: Record<GameSource, string> = {
  steam: "Steam",
  epic: "Epic",
  gog: "GOG",
  ubisoft: "Ubisoft",
  battlenet: "Battle.net",
  xbox: "Xbox",
  standalone: "Standalone",
};

const SOURCE_ABBREV: Record<GameSource, string> = {
  steam: "ST",
  epic: "EP",
  gog: "GO",
  ubisoft: "UB",
  battlenet: "BN",
  xbox: "XB",
  standalone: "SA",
};

interface SourceIconProps {
  source: GameSource;
  size?: "sm" | "md";
  className?: string;
}

export function SourceIcon({ source, size = "sm", className }: SourceIconProps) {
  const sizeClass = size === "sm" ? "h-5 w-5 text-[9px]" : "h-6 w-6 text-[10px]";

  return (
    <span
      title={SOURCE_LABELS[source]}
      className={cn(
        "inline-flex items-center justify-center rounded-sm font-bold shrink-0",
        sizeClass,
        SOURCE_COLORS[source],
        className,
      )}
    >
      {SOURCE_ABBREV[source]}
    </span>
  );
}

export { SOURCE_LABELS, SOURCE_COLORS };
