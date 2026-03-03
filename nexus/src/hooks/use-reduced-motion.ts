import { useReducedMotion } from "motion/react";

/**
 * Re-exports Motion's useReducedMotion hook as the app-level API.
 * Returns `true` when the OS "prefers-reduced-motion: reduce" setting is active.
 *
 * Centralised here so every consumer imports from the same place,
 * making it easy to swap the underlying implementation later.
 */
export { useReducedMotion };
