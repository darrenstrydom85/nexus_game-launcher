import type { Game } from "@/stores/gameStore";

export type PackId = "all" | "backlog" | "fresh" | "quick";

export interface PackDef {
  id: PackId;
  name: string;
  hint: string;
  /** Foil gradient stops. */
  foil: [string, string];
  filter: (g: Game) => boolean;
}

export const PACKS: PackDef[] = [
  { id: "all", name: "Everything", hint: "Anything in your library", foil: ["#7c3aed", "#312e81"], filter: () => true },
  { id: "backlog", name: "Backlog", hint: "Games you meant to get to", foil: ["#f59e0b", "#9a3412"], filter: (g) => g.status === "backlog" },
  { id: "fresh", name: "Never played", hint: "Not launched even once", foil: ["#14b8a6", "#134e4a"], filter: (g) => g.playCount === 0 && !g.lastPlayedAt },
  {
    id: "quick",
    name: "Quick hit",
    hint: "Ten hours or less to beat",
    foil: ["#ec4899", "#831843"],
    filter: (g) => g.hltbMainH != null && g.hltbMainH > 0 && g.hltbMainH <= 10,
  },
];

/** Everything a pack may draw from: not hidden, archived or dropped. */
export function basePool(games: Game[], hiddenIds: string[]): Game[] {
  const hidden = new Set(hiddenIds);
  return games.filter((g) => !hidden.has(g.id) && !g.isHidden && g.status !== "removed" && g.status !== "dropped");
}

export function drawFrom(pool: Game[], rand: () => number = Math.random): Game | null {
  return pool.length === 0 ? null : pool[Math.floor(rand() * pool.length) % pool.length];
}

export type Rarity = "legendary" | "epic" | "rare" | "common";

/** Card frame by critic score, the way a pack's rarity tiers read. */
export function rarityOf(g: Game): Rarity {
  const score = g.criticScore ?? 0;
  return score >= 90 ? "legendary" : score >= 80 ? "epic" : score >= 70 ? "rare" : "common";
}

export const RARITY_LABEL: Record<Rarity, string> = { legendary: "Legendary pull", epic: "Epic pull", rare: "Rare pull", common: "Common pull" };
