import { Sparkles } from "lucide-react";
import type { GameCeremonyData } from "@/lib/tauri";

interface CeremonyFunFactsCardProps {
  data: GameCeremonyData;
}

export function CeremonyFunFactsCard({ data }: CeremonyFunFactsCardProps) {
  if (data.funFacts.length === 0) {
    return (
      <div
        data-testid="ceremony-fun-facts-card"
        className="flex h-full flex-col items-center justify-center gap-6 px-8 py-8 text-center"
      >
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
          <Sparkles className="size-4" />
          Fun Facts
        </div>
        <p className="max-w-lg text-base text-muted-foreground">
          Not enough data to unpack this one — but thanks for the company.
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="ceremony-fun-facts-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-8 text-center"
    >
      <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-primary">
        <Sparkles className="size-4" />
        Fun Facts
      </div>

      <h2 className="max-w-2xl text-3xl font-bold text-foreground">
        Did you know?
      </h2>

      <div className="flex w-full max-w-2xl flex-col gap-4">
        {data.funFacts.map((fact, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-card/60 px-6 py-5 text-left backdrop-blur-sm"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest text-primary">
              #{i + 1}
            </span>
            <p className="mt-1 text-xl font-semibold leading-snug text-foreground">
              {fact}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
