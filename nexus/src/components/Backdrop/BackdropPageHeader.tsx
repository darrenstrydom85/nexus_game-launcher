import { cn } from "@/lib/utils";

interface BackdropPageHeaderProps {
  eyebrow: string;
  title: string;
  /** Right-aligned slot (counts, actions). */
  right?: React.ReactNode;
  className?: string;
}

/** Cinematic page header: tracked-caps eyebrow over a condensed display title. */
export function BackdropPageHeader({ eyebrow, title, right, className }: BackdropPageHeaderProps) {
  return (
    <div className={cn("flex items-end justify-between gap-6", className)}>
      <div>
        <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
        <h2 className="font-display text-[44px] font-bold uppercase leading-[0.95] tracking-tight text-foreground">
          {title}
        </h2>
      </div>
      {right && <div className="flex items-center gap-3 pb-1.5">{right}</div>}
    </div>
  );
}
