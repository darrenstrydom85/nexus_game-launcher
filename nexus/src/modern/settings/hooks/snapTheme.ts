import { flushSync } from "react-dom";

const NO_TRANSITIONS = "*,*::before,*::after{transition:none!important}";

/**
 * Applies a theme or accent change with every transition switched off for one
 * frame, so the whole app snaps to the new colours together instead of each
 * surface crossfading at its own speed.
 */
export function snapThemeChange(apply: () => void): void {
  if (typeof document === "undefined") {
    apply();
    return;
  }
  const style = document.createElement("style");
  style.setAttribute("data-theme-snap", "");
  style.textContent = NO_TRANSITIONS;
  document.head.appendChild(style);
  try {
    // Commit the store update, and the effect that writes the CSS variables,
    // now so the reflow below picks up the new colours with transitions off.
    flushSync(apply);
  } finally {
    void document.body.offsetHeight;
    const restore = () => style.remove();
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(restore);
    else setTimeout(restore, 0);
  }
}
