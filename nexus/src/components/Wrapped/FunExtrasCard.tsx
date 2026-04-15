import { Gem, Smile, Lightbulb, HardDriveDownload } from "lucide-react";
import { useGameResolver } from "@/hooks/useGameResolver";
import type { WrappedReport } from "@/types/wrapped";

interface FunExtrasCardProps {
  report: WrappedReport;
}

export function FunExtrasCard({ report }: FunExtrasCardProps) {
  const { resolve, openGame } = useGameResolver();
  const hasMood = Boolean(report.moodTagline);
  const hasGem = Boolean(report.hiddenGem);
  const hasTrivia = report.trivia.length > 0;
  const gemResolved = report.hiddenGem ? resolve(report.hiddenGem.gameId, report.hiddenGem.name) : null;

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
          <div
            className={`flex items-start gap-4 rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm ${gemResolved ? "cursor-pointer transition-colors hover:bg-white/5" : ""}`}
            onClick={gemResolved ? () => openGame(report.hiddenGem!.gameId, report.hiddenGem!.name) : undefined}
            role={gemResolved ? "button" : undefined}
            tabIndex={gemResolved ? 0 : undefined}
            onKeyDown={gemResolved ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openGame(report.hiddenGem!.gameId, report.hiddenGem!.name); } } : undefined}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gem className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Hidden Gem
              </p>
              <p className={`mt-0.5 flex items-center gap-1.5 text-base font-semibold ${gemResolved ? "text-foreground hover:text-primary" : "text-foreground"}`}>
                {gemResolved?.isRemoved && <HardDriveDownload className="size-3.5 shrink-0 text-muted-foreground" />}
                <span>{report.hiddenGem.name}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {report.hiddenGem.tagline}
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
