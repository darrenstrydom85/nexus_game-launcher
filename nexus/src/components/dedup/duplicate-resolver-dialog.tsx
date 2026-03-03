import { useState } from "react";
import type { DuplicateCandidate, DuplicateResolution } from "@/lib/tauri";
import type { GameSource } from "@/stores/gameStore";
import { useDedupStore } from "@/stores/dedupStore";
import { Button } from "@/components/ui/button";
import { SourceIcon, SOURCE_LABELS } from "./source-icon";
import { cn } from "@/lib/utils";

interface DuplicateResolverDialogProps {
  candidates: DuplicateCandidate[];
  onComplete?: () => void;
}

type ResolutionChoice = "prefer_source" | "keep_both" | "hide_one";

export function DuplicateResolverDialog({
  candidates,
  onComplete,
}: DuplicateResolverDialogProps) {
  const resolveCandidate = useDedupStore((s) => s.resolveCandidate);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [resolution, setResolution] = useState<ResolutionChoice | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  if (candidates.length === 0) return null;

  const current = candidates[currentIndex];
  if (!current) {
    onComplete?.();
    return null;
  }

  const games = [
    { id: current.gameAId, name: current.gameAName, source: current.gameASource },
    { id: current.gameBId, name: current.gameBName, source: current.gameBSource },
  ];

  const matchLabel =
    current.matchMethod === "igdbId"
      ? "IGDB ID Match"
      : current.matchMethod === "exactName"
        ? "Exact Name Match"
        : `Fuzzy Match (${Math.round(current.confidence * 100)}%)`;

  async function handleResolve() {
    if (!selectedGame || !resolution) return;

    setIsResolving(true);
    try {
      await resolveCandidate(
        [current.gameAId, current.gameBId],
        selectedGame,
        resolution as DuplicateResolution,
      );

      if (currentIndex + 1 < candidates.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedGame(null);
        setResolution(null);
      } else {
        onComplete?.();
      }
    } finally {
      setIsResolving(false);
    }
  }

  function handleSkip() {
    if (currentIndex + 1 < candidates.length) {
      setCurrentIndex((i) => i + 1);
      setSelectedGame(null);
      setResolution(null);
    } else {
      onComplete?.();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Duplicate Detected</h2>
          <span className="text-xs text-muted-foreground">
            {currentIndex + 1} of {candidates.length}
          </span>
        </div>

        <p className="mb-1 text-sm text-muted-foreground">
          These games appear to be the same title from different sources.
        </p>
        <span className="mb-4 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {matchLabel}
        </span>

        <div className="mb-5 space-y-2">
          {games.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setSelectedGame(g.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all",
                selectedGame === g.id
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:border-muted-foreground/30",
              )}
            >
              <SourceIcon source={g.source as GameSource} size="md" />
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium">{g.name}</p>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[g.source as GameSource]}
                </p>
              </div>
              {selectedGame === g.id && (
                <span className="text-xs font-medium text-primary">
                  Preferred
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mb-5">
          <p className="mb-2 text-sm font-medium">What would you like to do?</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                {
                  value: "prefer_source" as const,
                  label: "Prefer Source",
                  desc: "Show preferred, keep both in library",
                },
                {
                  value: "keep_both" as const,
                  label: "Keep Both",
                  desc: "Show both games separately",
                },
                {
                  value: "hide_one" as const,
                  label: "Hide One",
                  desc: "Hide the non-preferred game",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setResolution(opt.value)}
                className={cn(
                  "flex flex-col items-center rounded-lg border p-3 text-center transition-all",
                  resolution === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30",
                )}
              >
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={handleSkip}>
            Skip
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onComplete}>
              Dismiss All
            </Button>
            <Button
              size="sm"
              disabled={!selectedGame || !resolution || isResolving}
              onClick={handleResolve}
            >
              {isResolving ? "Resolving..." : "Resolve"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
