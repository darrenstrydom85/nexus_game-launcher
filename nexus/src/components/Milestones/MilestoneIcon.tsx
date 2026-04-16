import {
  Timer,
  Sunrise,
  Moon,
  Trophy,
  Star,
  Sparkles,
  Utensils,
  HandMetal,
  Award,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  timer: Timer,
  sunrise: Sunrise,
  moon: Moon,
  trophy: Trophy,
  star: Star,
  sparkles: Sparkles,
  utensils: Utensils,
  "hand-metal": HandMetal,
};

interface MilestoneIconProps {
  name: string;
  className?: string;
}

export function MilestoneIcon({ name, className = "size-5" }: MilestoneIconProps) {
  const Icon = ICON_MAP[name] ?? Award;
  return <Icon className={className} />;
}
