import type { GameSource, GameStatus } from "@/stores/gameStore";

export const SOURCE_CODE: Record<GameSource, string> = {
  steam: "STEAM",
  epic: "EPIC",
  gog: "GOG",
  ubisoft: "UBI",
  battlenet: "BNET",
  xbox: "XBOX",
  standalone: "FILE",
};

export const STATUS_CODE: Record<GameStatus, string> = {
  playing: "PLAY",
  completed: "DONE",
  backlog: "BKLG",
  dropped: "DROP",
  wishlist: "WISH",
  removed: "ARCH",
  unset: "----",
};

/** Statuses the user can cycle through with F7 (archive is managed elsewhere). */
export const STATUS_CYCLE: GameStatus[] = [
  "unset",
  "backlog",
  "playing",
  "completed",
  "dropped",
  "wishlist",
];

export function fmtHours(totalS: number): string {
  return (totalS / 3600).toFixed(1);
}

/** MM-DD-YY, DOS style. */
export function fmtDate(iso: string | null): string {
  if (!iso) return "--/--/--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--/--/--";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}

/** HH:MM:SS from seconds. */
export function fmtClock(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${ss}`;
}

/** "1H 23M" style duration. */
export function fmtDur(totalS: number): string {
  const m = Math.floor(totalS / 60);
  if (m < 60) return `${m}M`;
  return `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, "0")}M`;
}

/** 1-5 rating as asterisks: 3 -> "***..", null -> ".....". */
export function fmtStars(rating: number | null): string {
  const r = rating ?? 0;
  return "*".repeat(r).padEnd(5, ".");
}

/** ASCII bar chart segment: value 5 of max 10, width 10 -> "#####.....". */
export function fmtBar(value: number, max: number, width: number): string {
  if (max <= 0 || value <= 0) return ".".repeat(width);
  const filled = Math.max(1, Math.round((value / max) * width));
  return "#".repeat(Math.min(width, filled)).padEnd(width, ".");
}
