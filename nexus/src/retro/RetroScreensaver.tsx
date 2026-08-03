import * as React from "react";
import { NEXUS_LOGO } from "./logo";

const COLORS = ["#55ffff", "#55ff55", "#ffff55", "#ff55ff", "#ff5555", "#5555ff", "#ffffff"];

export type SaverVariant = "logo" | "starfield" | "matrix";

const VARIANTS: SaverVariant[] = ["logo", "starfield", "matrix"];

const MATRIX_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&*+=-<>";

function BouncingLogo() {
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
    <div ref={boxRef} style={{ position: "absolute", inset: 0 }}>
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

/** Fullscreen canvas that sizes itself to the window; jsdom-safe (no ctx = no-op). */
function useSaverCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, intervalMs: number) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    const id = setInterval(() => draw(ctx, canvas.width, canvas.height), intervalMs);
    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(id);
    };
  }, [draw, intervalMs]);

  return canvasRef;
}

function Starfield() {
  const stars = React.useRef<{ x: number; y: number; z: number }[]>([]);

  const draw = React.useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (stars.current.length === 0) {
      stars.current = Array.from({ length: 160 }, () => ({
        x: Math.random() * 2 - 1,
        y: Math.random() * 2 - 1,
        z: Math.random() * 0.9 + 0.1,
      }));
    }
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (const s of stars.current) {
      s.z -= 0.006;
      if (s.z <= 0.02) {
        s.x = Math.random() * 2 - 1;
        s.y = Math.random() * 2 - 1;
        s.z = 1;
      }
      const px = (s.x / s.z) * (w / 2) + w / 2;
      const py = (s.y / s.z) * (h / 2) + h / 2;
      if (px < 0 || px >= w || py < 0 || py >= h) {
        s.x = Math.random() * 2 - 1;
        s.y = Math.random() * 2 - 1;
        s.z = 1;
        continue;
      }
      const size = Math.max(1, (1 - s.z) * 3);
      const shade = Math.floor((1 - s.z) * 255);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
      ctx.fillRect(px, py, size, size);
    }
  }, []);

  const ref = useSaverCanvas(draw, 30);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0 }} data-testid="retro-saver-starfield" />;
}

function MatrixRain() {
  const drops = React.useRef<number[]>([]);

  const draw = React.useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const col = 16;
    const cols = Math.ceil(w / col);
    if (drops.current.length !== cols) {
      drops.current = Array.from({ length: cols }, () => Math.floor(Math.random() * (h / col)));
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
    ctx.fillRect(0, 0, w, h);
    ctx.font = "16px 'VT323', monospace";
    for (let i = 0; i < cols; i++) {
      const ch = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
      const y = drops.current[i] * col;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, i * col, y);
      ctx.fillStyle = "#55ff55";
      ctx.fillText(ch, i * col, y - col);
      drops.current[i] = y > h && Math.random() > 0.975 ? 0 : drops.current[i] + 1;
    }
  }, []);

  const ref = useSaverCanvas(draw, 50);
  return <canvas ref={ref} style={{ position: "absolute", inset: 0 }} data-testid="retro-saver-matrix" />;
}

/**
 * Idle screensaver. Picks a random variant each time it activates:
 * bouncing NEXUS logo, starfield, or matrix rain. Purely visual; the
 * owner (RetroApp) decides when to show it and handles waking.
 */
export function RetroScreensaver({ variant }: { variant?: SaverVariant }) {
  const [chosen] = React.useState<SaverVariant>(
    () => variant ?? VARIANTS[Math.floor(Math.random() * VARIANTS.length)],
  );

  return (
    <div
      data-testid="retro-screensaver"
      style={{ position: "fixed", inset: 0, zIndex: 70, background: "#000", overflow: "hidden", cursor: "none" }}
    >
      {chosen === "logo" && <BouncingLogo />}
      {chosen === "starfield" && <Starfield />}
      {chosen === "matrix" && <MatrixRain />}
    </div>
  );
}
