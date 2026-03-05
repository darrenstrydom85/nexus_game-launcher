import * as React from "react";
import { Library, PlusCircle } from "lucide-react";
import type { WrappedReport } from "@/types/wrapped";

interface LibraryGrowthCardProps {
  report: WrappedReport;
}

export function LibraryGrowthCard({ report }: LibraryGrowthCardProps) {
  const growthPercent =
    report.totalGamesInLibrary > 0
      ? ((report.newGamesAdded / report.totalGamesInLibrary) * 100).toFixed(1)
      : "0.0";

  return (
    <div
      data-testid="library-growth-card"
      className="flex h-full flex-col items-center justify-center gap-8 px-8 py-12"
    >
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">
          Library Growth
        </p>
        <h2 className="mt-2 text-3xl font-bold text-foreground">
          Your collection
        </h2>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/40 p-5 backdrop-blur-sm">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Library className="size-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Total Library Size
            </p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
              {report.totalGamesInLibrary}
            </p>
            <p className="text-xs text-muted-foreground">games in your library</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-border bg-card/40 p-5 backdrop-blur-sm">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <PlusCircle className="size-6" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              New Games Added
            </p>
            <p className="mt-0.5 text-3xl font-bold tabular-nums text-foreground">
              {report.newGamesAdded}
            </p>
            <p className="text-xs text-muted-foreground">
              {growthPercent}% of your library is new this period
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
