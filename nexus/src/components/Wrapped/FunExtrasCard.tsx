import * as React from "react";
import { Gem, Smile, Lightbulb } from "lucide-react";
import { formatPlayTime } from "@/lib/utils";
import type { WrappedReport } from "@/types/wrapped";

interface FunExtrasCardProps {
  report: WrappedReport;
}

export function FunExtrasCard({ report }: FunExtrasCardProps) {
  const hasMood = Boolean(report.moodTagline);
  const hasGem = Boolean(report.hiddenGem);
  const hasTrivia = report.trivia.length > 0;

  if (!hasMood && !hasGem && !hasTrivia) return null;

  return (
    <div
      data-testid="fun-extras-card"
      className="flex h-full flex-col justify-center gap-6 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Fun Extras
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          A few more things…
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        {hasMood && (
          <div className="flex items-start gap-4 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Smile className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Gaming Mood
              </p>
              <p className="mt-0.5 text-base font-semibold text-foreground">
                {report.moodTagline}
              </p>
            </div>
          </div>
        )}

        {hasGem && report.hiddenGem && (
          <div className="flex items-start gap-4 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gem className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Hidden Gem
              </p>
              <p className="mt-0.5 text-base font-semibold text-foreground">
                {report.hiddenGem.name}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                You put {formatPlayTime(report.hiddenGem.playTimeS)} into a{" "}
                {report.hiddenGem.rating !== null
                  ? `${report.hiddenGem.rating}-rated`
                  : "low-rated"}{" "}
                title
              </p>
            </div>
          </div>
        )}

        {hasTrivia &&
          report.trivia.map((fact, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Lightbulb className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Did You Know?
                </p>
                <p className="mt-0.5 text-base font-semibold text-foreground">
                  {fact}
                </p>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
