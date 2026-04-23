import * as React from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Clapperboard, X } from "lucide-react";
import {
  getTwitchClipsForGame,
  type TwitchClip,
} from "@/lib/tauri";
import { useTwitchStore } from "@/stores/twitchStore";
import { useConnectivityStore } from "@/stores/connectivityStore";

const DEBOUNCE_MS = 300;
/** `parent=` parameters required by Twitch's clip embed iframe. Same set as StreamEmbed. */
const EMBED_PARENTS = ["tauri.localhost", "localhost"];

export interface TwitchClipsRowProps {
  gameName: string;
}

function clipThumb(template: string): string {
  return template.replace("{width}", "320").replace("{height}", "180");
}

function buildClipEmbedUrl(clipId: string): string {
  const parents = EMBED_PARENTS.map(
    (p) => `parent=${encodeURIComponent(p)}`,
  ).join("&");
  return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&${parents}&autoplay=true`;
}

function ClipsRowSkeleton() {
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6"
      data-testid="twitch-clips-row-skeleton"
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex flex-col gap-1.5" aria-hidden>
          <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

export function TwitchClipsRow({ gameName }: TwitchClipsRowProps) {
  const isAuthenticated = useTwitchStore((s) => s.isAuthenticated);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const [clips, setClips] = React.useState<TwitchClip[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeClip, setActiveClip] = React.useState<TwitchClip | null>(null);
  const [resolvedGameName, setResolvedGameName] = React.useState<string>("");

  React.useEffect(() => {
    if (!isAuthenticated || !isOnline || !gameName.trim()) {
      setClips([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      getTwitchClipsForGame(gameName)
        .then((res) => {
          if (cancelled) return;
          setClips(res.clips);
          setResolvedGameName(res.twitchGameName);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setError(
            e instanceof Error ? e.message : "Failed to load clips",
          );
          setClips([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [gameName, isAuthenticated, isOnline]);

  // The card stays out of the way entirely when the user isn't authenticated or
  // the game has no Twitch presence — we don't want a permanently-empty section
  // cluttering every detail view.
  if (!isAuthenticated) return null;
  if (!loading && (clips?.length ?? 0) === 0 && !error) return null;

  return (
    <div
      data-testid="twitch-clips-row"
      className="rounded-lg border border-border bg-card p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clapperboard
            className="size-4 text-[color:var(--twitch-purple,#9146ff)]"
            aria-hidden
          />
          Top clips this week
          {resolvedGameName && (
            <span className="text-xs font-normal text-muted-foreground">
              · {resolvedGameName}
            </span>
          )}
        </h3>
      </div>

      {loading && <ClipsRowSkeleton />}
      {!loading && error && (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load clips right now.
        </p>
      )}
      {!loading && !error && (clips?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
          {clips!.map((clip) => (
            <button
              key={clip.id}
              type="button"
              onClick={() => setActiveClip(clip)}
              className="group flex flex-col gap-1 overflow-hidden rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label={`Play clip: ${clip.title} by ${clip.broadcasterName}`}
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-md bg-muted">
                <img
                  src={clipThumb(clip.thumbnailUrl)}
                  alt=""
                  className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                  width={320}
                  height={180}
                  loading="lazy"
                />
                <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {clip.viewCount.toLocaleString()} views
                </span>
              </div>
              <p
                className="line-clamp-2 text-xs font-medium text-foreground"
                title={clip.title}
              >
                {clip.title}
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                {clip.broadcasterName}
              </p>
            </button>
          ))}
        </div>
      )}

      {activeClip && (
        <div
          role="dialog"
          aria-label={`Clip: ${activeClip.title}`}
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setActiveClip(null)}
        >
          <div
            className="relative w-full max-w-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setActiveClip(null)}
              className="absolute -top-10 right-0 rounded p-1.5 text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close clip"
              data-testid="twitch-clip-close"
            >
              <X className="size-5" />
            </button>
            <div className="aspect-video w-full overflow-hidden rounded-md bg-black">
              <iframe
                data-testid="twitch-clip-embed"
                title={activeClip.title}
                src={buildClipEmbedUrl(activeClip.id)}
                allow="autoplay; fullscreen"
                allowFullScreen
                className="size-full"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <p className="truncate text-white">{activeClip.title}</p>
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-white hover:bg-white/10"
                onClick={() => {
                  void openUrl(activeClip.url).catch(() => {});
                }}
              >
                Open on Twitch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
