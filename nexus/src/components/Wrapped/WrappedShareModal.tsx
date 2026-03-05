import * as React from "react";
import { toPng } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Download, Copy, FileText, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toastStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { WrappedShareCard } from "./WrappedShareCard";
import type { WrappedReport } from "@/types/wrapped";

// ── Plain-text formatter ─────────────────────────────────────────────────────

export function formatWrappedStatsText(report: WrappedReport): string {
  const totalHours = Math.floor(report.totalPlayTimeS / 3600);
  const lines: string[] = [];

  lines.push(`My ${report.periodLabel} in Gaming: ${totalHours}h across ${report.totalGamesPlayed} games.`);

  if (report.mostPlayedGame) {
    const topHours = Math.floor(report.mostPlayedGame.playTimeS / 3600);
    lines.push(`Most played: ${report.mostPlayedGame.name} (${topHours}h).`);
  }

  if (report.mostPlayedGenre) {
    lines.push(`Top genre: ${report.mostPlayedGenre}.`);
  }

  if (report.longestStreakDays > 0) {
    lines.push(`Longest streak: ${report.longestStreakDays} day${report.longestStreakDays !== 1 ? "s" : ""}.`);
  }

  return lines.join(" ");
}

// ── Filename helper ──────────────────────────────────────────────────────────

function buildFilename(periodLabel: string): string {
  const slug = periodLabel
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  return `nexus-wrapped-${slug}.png`;
}

// ── Modal ────────────────────────────────────────────────────────────────────

interface WrappedShareModalProps {
  report: WrappedReport;
  onClose: () => void;
}

type GenerationState = "idle" | "generating" | "ready" | "error";

export function WrappedShareModal({ report, onClose }: WrappedShareModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<GenerationState>("idle");
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const accentColor = useSettingsStore((s) => s.accentColor);

  // Generate image on mount
  React.useEffect(() => {
    let cancelled = false;

    function isSafeImage(node: Node): boolean {
      if (!(node instanceof HTMLImageElement)) return true;
      const src = node.getAttribute("src") ?? "";
      if (!src) return false;
      if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) return true;
      if (src.startsWith(window.location.origin)) return true;
      return false;
    }

    async function generate() {
      if (!cardRef.current) return;
      setState("generating");
      try {
        const url = await toPng(cardRef.current, {
          cacheBust: false,
          width: 1080,
          height: 1080,
          pixelRatio: 1,
          filter: isSafeImage,
        });
        if (!cancelled) {
          setDataUrl(url);
          setState("ready");
        }
      } catch (err) {
        console.error("[WrappedShare] image generation failed:", err);
        if (!cancelled) {
          setState("error");
          addToast({
            type: "error",
            message: "Couldn't generate image — try again in a moment",
          });
        }
      }
    }

    // Small delay to ensure the off-screen card has rendered
    const timer = setTimeout(generate, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [addToast]);

  async function handleDownload() {
    if (!dataUrl) return;
    const filename = buildFilename(report.periodLabel);
    try {
      const savePath = await save({
        defaultPath: filename,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!savePath) return;

      // Convert data URL to Uint8Array
      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      await writeFile(savePath, bytes);
      addToast({ type: "success", message: "Image saved!" });
    } catch {
      addToast({ type: "error", message: "Failed to save image." });
    }
  }

  async function handleCopyImage() {
    if (!dataUrl) return;
    try {
      const base64 = dataUrl.split(",")[1];
      await invoke("write_image_to_clipboard", { base64Png: base64 });
      addToast({ type: "success", message: "Image copied to clipboard!" });
    } catch {
      addToast({ type: "error", message: "Failed to copy image to clipboard." });
    }
  }

  async function handleCopyText() {
    const text = formatWrappedStatsText(report);
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: "success", message: "Stats copied to clipboard!" });
    } catch {
      addToast({ type: "error", message: "Failed to copy stats." });
    }
  }

  const isGenerating = state === "generating" || state === "idle";
  const hasError = state === "error";

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="share-modal-backdrop"
        className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        data-testid="wrapped-share-modal"
        role="dialog"
        aria-label="Save Wrapped as Image"
        aria-modal="true"
        className="fixed inset-0 z-[56] flex items-center justify-center p-6"
      >
        <div
          className={cn(
            "relative flex w-full max-w-lg flex-col gap-5 rounded-xl",
            "border border-border bg-card p-6 shadow-2xl",
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Save as Image
            </h2>
            <button
              type="button"
              data-testid="share-modal-close"
              onClick={onClose}
              aria-label="Close share modal"
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                "text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Preview area */}
          <div
            data-testid="share-preview-area"
            className={cn(
              "relative flex aspect-square w-full items-center justify-center overflow-hidden",
              "rounded-lg border border-border bg-background",
            )}
          >
            {isGenerating && (
              <div
                data-testid="share-generating-state"
                className="flex flex-col items-center gap-3 text-muted-foreground"
              >
                <Loader2 className="size-8 animate-spin text-primary" />
                <span className="text-sm">Generating image...</span>
              </div>
            )}
            {hasError && (
              <div className="flex flex-col items-center gap-2 px-8 text-center text-muted-foreground">
                <span className="text-sm">
                  Couldn&apos;t generate image — some artwork may not be cached yet
                </span>
              </div>
            )}
            {state === "ready" && dataUrl && (
              <img
                data-testid="share-preview-image"
                src={dataUrl}
                alt="Wrapped share card preview"
                className="h-full w-full object-contain"
              />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="share-download-button"
              onClick={handleDownload}
              disabled={isGenerating || hasError}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5",
                "bg-primary text-sm font-medium text-primary-foreground",
                "transition-opacity hover:opacity-90",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <Download className="size-4" />
              Download
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                data-testid="share-copy-image-button"
                onClick={handleCopyImage}
                disabled={isGenerating || hasError}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5",
                  "border border-border bg-card text-sm font-medium text-foreground",
                  "transition-colors hover:bg-accent",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-40",
                )}
              >
                <Copy className="size-4" />
                Copy Image
              </button>

              <button
                type="button"
                data-testid="share-copy-text-button"
                onClick={handleCopyText}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5",
                  "border border-border bg-card text-sm font-medium text-foreground",
                  "transition-colors hover:bg-accent",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <FileText className="size-4" />
                Copy Stats
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Off-screen share card for html-to-image capture */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: "-9999px",
          width: 1080,
          height: 1080,
          overflow: "hidden",
          pointerEvents: "none",
          zIndex: -1,
        }}
      >
        <WrappedShareCard ref={cardRef} report={report} accentColor={accentColor} />
      </div>
    </>
  );
}
