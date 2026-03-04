import { openUrl } from "@tauri-apps/plugin-opener";
import { X } from "lucide-react";
import type { PendingToastItem } from "@/stores/twitchStore";
import { cn } from "@/lib/utils";

const TWITCH_ICON_SVG = (
  <svg viewBox="0 0 24 24" fill="currentColor" className="size-3 shrink-0" aria-hidden>
    <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
  </svg>
);

export interface TwitchToastProps {
  toast: PendingToastItem;
  onDismiss: (id: string) => void;
  onOpenChannel: (login: string) => void;
}

export function TwitchToast({ toast, onDismiss, onOpenChannel }: TwitchToastProps) {
  const url = `https://twitch.tv/${toast.login}`;
  const ariaLabel = `${toast.displayName} is now live, playing ${toast.gameName}`;

  const handleBodyClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("[data-dismiss]")) return;
    onOpenChannel(toast.login);
    openUrl(url).catch(() => {});
    onDismiss(toast.id);
  };

  const handleBodyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onDismiss(toast.id);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if ((e.target as HTMLElement).closest("[data-dismiss]")) {
        onDismiss(toast.id);
      } else {
        onOpenChannel(toast.login);
        openUrl(url).catch(() => {});
        onDismiss(toast.id);
      }
    }
  };

  return (
    <article
      role="status"
      aria-label={ariaLabel}
      tabIndex={0}
      onClick={handleBodyClick}
      onKeyDown={handleBodyKeyDown}
      className={cn(
        "relative flex max-w-[360px] cursor-pointer gap-3 rounded-lg border shadow-lg backdrop-blur-[12px]",
        "border-[hsla(240,10%,20%,0.4)] bg-[hsla(240,10%,8%,0.85)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        toast.isFavorite && "border-l-2 border-l-yellow-500",
      )}
      style={{ minWidth: 0 }}
    >
      <div className="relative shrink-0 pt-3 pl-3">
        <img
          src={toast.profileImageUrl}
          alt=""
          className="size-8 rounded-full object-cover"
          width={32}
          height={32}
        />
        <span
          className="absolute bottom-0 left-3 size-1.5 rounded-full bg-red-500"
          style={{
            transform: "translateY(50%)",
            boxShadow: "0 0 0 2px hsla(240,10%,8%,0.85)",
          }}
          aria-hidden
        />
        <span
          className="absolute bottom-0 left-3 size-1.5 animate-pulse rounded-full bg-red-500 opacity-90"
          style={{
            transform: "translateY(50%)",
            animationDuration: "1.5s",
          }}
          aria-hidden
        />
      </div>
      <div className="min-w-0 flex-1 py-3 pr-8">
        <p className="text-[15px] font-medium leading-tight text-foreground">
          {toast.displayName} is live
        </p>
        <p className="text-[13px] text-muted-foreground">Playing {toast.gameName}</p>
        <p className="truncate text-[13px] text-muted-foreground" title={toast.title}>
          {toast.title || "—"}
        </p>
      </div>
      <div className="absolute right-2 top-2 flex items-center gap-1 text-muted-foreground">
        {TWITCH_ICON_SVG}
        <button
          type="button"
          data-dismiss
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="rounded p-0.5 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Dismiss notification"
        >
          <X className="size-3.5" strokeWidth={2} aria-hidden />
        </button>
      </div>
    </article>
  );
}
