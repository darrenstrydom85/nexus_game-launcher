import * as React from "react";
import { toPng } from "html-to-image";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Download, Copy, FileText, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToastStore } from "@/stores/toastStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { CertificateCard } from "./CertificateCard";
import type { GameCeremonyData, MasteryTierValue } from "@/lib/tauri";

// ── Plain-text formatter ────────────────────────────────────────────────────

const TIER_LABELS: Record<Exclude<MasteryTierValue, "none">, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
};

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatCertificateText(data: GameCeremonyData): string {
  // Use the `completed` flag so archived/uninstalled games that were finished
  // (status = "removed", completed = true) still show "Completed".
  const statusLabel = data.completed
    ? "Completed"
    : data.status === "dropped"
      ? "Dropped"
      : data.status === "removed"
        ? "Retired"
        : data.status.charAt(0).toUpperCase() + data.status.slice(1);

  const lines: string[] = [];
  lines.push(`🎮 ${data.gameName} — ${statusLabel}`);
  lines.push(
    `⏱️ ${formatHours(data.totalPlayTimeS)} across ${data.totalSessions} session${
      data.totalSessions !== 1 ? "s" : ""
    }`,
  );
  if (data.firstPlayedAt && data.lastPlayedAt) {
    lines.push(`📅 ${formatDate(data.firstPlayedAt)} → ${formatDate(data.lastPlayedAt)}`);
  }
  if (data.rating && data.rating > 0) {
    lines.push(`⭐ ${data.rating}/5`);
  }
  if (data.masteryTier !== "none") {
    const tier = data.masteryTier as Exclude<MasteryTierValue, "none">;
    lines.push(`🏆 ${TIER_LABELS[tier]}`);
  }
  lines.push("— Nexus Game Launcher");
  return lines.join("\n");
}

// ── Filename helper ─────────────────────────────────────────────────────────

function buildFilename(gameName: string): string {
  const slug = gameName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `nexus-certificate-${slug || "game"}.png`;
}

// ── Cover art preloader ─────────────────────────────────────────────────────

/**
 * Try to load the cover art URL within a 3s budget.
 * Returns true if the image loaded, false if it timed out or errored.
 * If the asset is missing/cross-origin, we still render the card with a
 * gradient fallback — html-to-image would otherwise fail on a dirty canvas.
 */
function preloadCover(url: string | null): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), 3000);
  });
}

// ── Modal ───────────────────────────────────────────────────────────────────

interface CertificateShareModalProps {
  data: GameCeremonyData;
  onClose: () => void;
}

type GenerationState = "idle" | "generating" | "ready" | "error";

export function CertificateShareModal({ data, onClose }: CertificateShareModalProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [state, setState] = React.useState<GenerationState>("idle");
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [coverLoaded, setCoverLoaded] = React.useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const accentColor = useSettingsStore((s) => s.accentColor);

  React.useEffect(() => {
    let cancelled = false;

    function isSafeImage(node: Node): boolean {
      if (!(node instanceof HTMLImageElement)) return true;
      const src = node.getAttribute("src") ?? "";
      if (!src) return false;
      if (src.startsWith("data:") || src.startsWith("blob:") || src.startsWith("/")) return true;
      if (src.startsWith(window.location.origin)) return true;
      // asset:// (Tauri) and other local schemes are generally safe to include
      if (src.startsWith("asset:")) return true;
      return false;
    }

    async function generate() {
      try {
        setState("generating");

        // Preload the cover art first (3s budget) so the off-screen card has
        // the image painted before html-to-image captures it.
        const coverUrl = data.heroArtUrl ?? data.coverArtUrl;
        const ok = await preloadCover(coverUrl);
        if (cancelled) return;
        setCoverLoaded(ok);

        // Small delay to ensure the off-screen card has rendered with the
        // resolved coverLoaded value applied.
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (cancelled) return;
        if (!cardRef.current) {
          throw new Error("Card ref not mounted");
        }

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
        console.error("[CertificateShare] image generation failed:", err);
        if (!cancelled) {
          setState("error");
          addToast({
            type: "error",
            message: "Couldn't generate image — try again in a moment",
          });
        }
      }
    }

    generate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.gameId]);

  async function handleDownload() {
    if (!dataUrl) return;
    const filename = buildFilename(data.gameName);
    try {
      const savePath = await save({
        defaultPath: filename,
        filters: [{ name: "PNG Image", extensions: ["png"] }],
      });
      if (!savePath) return;

      const base64 = dataUrl.split(",")[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      await writeFile(savePath, bytes);
      addToast({ type: "success", message: "Certificate saved!" });
    } catch {
      addToast({ type: "error", message: "Failed to save certificate." });
    }
  }

  async function handleCopyImage() {
    if (!dataUrl) return;
    try {
      const base64 = dataUrl.split(",")[1];
      await invoke("write_image_to_clipboard", { base64Png: base64 });
      addToast({ type: "success", message: "Certificate copied to clipboard!" });
    } catch {
      addToast({ type: "error", message: "Failed to copy image to clipboard." });
    }
  }

  async function handleCopyText() {
    const text = formatCertificateText(data);
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
      <div
        data-testid="certificate-share-backdrop"
        className="fixed inset-0 z-[55] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        data-testid="certificate-share-modal"
        role="dialog"
        aria-label="Save Certificate as Image"
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
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">
              Save Certificate
            </h2>
            <button
              type="button"
              data-testid="certificate-share-close"
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

          <div
            data-testid="certificate-preview-area"
            className={cn(
              "relative flex aspect-square w-full items-center justify-center overflow-hidden",
              "rounded-lg border border-border bg-background",
            )}
          >
            {isGenerating && (
              <div
                data-testid="certificate-generating-state"
                className="flex flex-col items-center gap-3 text-muted-foreground"
              >
                <Loader2 className="size-8 animate-spin text-primary" />
                <span className="text-sm">Crafting your certificate...</span>
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
                data-testid="certificate-preview-image"
                src={dataUrl}
                alt="Retirement certificate preview"
                className="h-full w-full object-contain"
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              data-testid="certificate-download-button"
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
                data-testid="certificate-copy-image-button"
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
                data-testid="certificate-copy-text-button"
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

      {/* Off-screen card for html-to-image capture */}
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
        <CertificateCard
          ref={cardRef}
          data={data}
          accentColor={accentColor}
          coverLoaded={coverLoaded}
        />
      </div>
    </>
  );
}
