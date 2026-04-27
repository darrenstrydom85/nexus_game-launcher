import { useUiStore, type NavItem, type StatsScrollTarget } from "@/stores/uiStore";

const TRAY_NAV_ITEMS: NavItem[] = [
  "library",
  "stats",
  "completed",
  "archive",
  "achievements",
  "twitch",
];

export function isTrayNavItem(value: unknown): value is NavItem {
  return typeof value === "string" && TRAY_NAV_ITEMS.includes(value as NavItem);
}

export function navigateFromTrayTarget(value: unknown): boolean {
  if (!isTrayNavItem(value)) return false;
  useUiStore.getState().setActiveNav(value);
  return true;
}

export function navigateToStatsSection(target: StatsScrollTarget) {
  navigateFromTrayTarget("stats");
  useUiStore.getState().setStatsScrollTarget(target);
}
