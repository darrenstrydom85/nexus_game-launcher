import * as React from "react";

import { NEXUS_LOGO } from "./logo";

const COLORS = ["#55ffff", "#55ff55", "#ffff55", "#ff55ff", "#ff5555", "#5555ff", "#ffffff"];

/**
 * DVD-logo style bouncing NEXUS wordmark. Purely visual; the owner
 * (RetroApp) decides when to show it and handles waking.
 */
export function RetroScreensaver() {
  const [pos, setPos] = React.useState({ x: 40, y: 40 });
  const [colorIdx, setColorIdx] = React.useState(0);
  const vel = React.useRef({ dx: 1.6, dy: 1.1 });
  const boxRef = React.useRef<HTMLDivElement>(null);
  const logoRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const id = setInterval(() => {
      const box = boxRef.current;
      const logo = logoRef.current;
      if (!box || !logo) return;
      const maxX = Math.max(0, box.clientWidth - logo.clientWidth);
      const maxY = Math.max(0, box.clientHeight - logo.clientHeight);
      setPos((p) => {
        let { dx, dy } = vel.current;
        let x = p.x + dx;
        let y = p.y + dy;
        let bounced = false;
        if (x <= 0 || x >= maxX) { dx = -dx; x = Math.max(0, Math.min(maxX, x)); bounced = true; }
        if (y <= 0 || y >= maxY) { dy = -dy; y = Math.max(0, Math.min(maxY, y)); bounced = true; }
        vel.current = { dx, dy };
        if (bounced) setColorIdx((c) => (c + 1) % COLORS.length);
        return { x, y };
      });
    }, 30);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      ref={boxRef}
      data-testid="retro-screensaver"
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "#000", overflow: "hidden", cursor: "none" }}
    >
      <div
        ref={logoRef}
        style={{
          position: "absolute",
          left: pos.x,
          top: pos.y,
          color: COLORS[colorIdx],
          whiteSpace: "pre",
          lineHeight: 1,
          fontSize: 14,
        }}
      >
        {NEXUS_LOGO.join("\n")}
      </div>
    </div>
  );
}
