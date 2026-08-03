import * as React from "react";

const VGA = ["#55ffff", "#55ff55", "#ffff55", "#ff55ff", "#ff5555", "#5555ff", "#ffffff", "#ffaa00"];

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; color: string;
}

/**
 * Konami reward: canvas fireworks over the whole screen for a few seconds.
 * Any key or click ends it early (and the key is swallowed).
 */
export function RetroFireworks({ onDone }: { onDone: () => void }) {
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 6000);
    const skip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      doneRef.current();
    };
    document.addEventListener("keydown", skip, true);
    document.addEventListener("mousedown", skip, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", skip, true);
      document.removeEventListener("mousedown", skip, true);
    };
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles: Particle[] = [];

    const burst = () => {
      const cx = canvas.width * (0.15 + Math.random() * 0.7);
      const cy = canvas.height * (0.1 + Math.random() * 0.4);
      const color = VGA[Math.floor(Math.random() * VGA.length)];
      for (let i = 0; i < 60; i++) {
        const angle = (Math.PI * 2 * i) / 60 + Math.random() * 0.2;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color,
        });
      }
    };

    burst();
    const burstId = setInterval(burst, 650);
    const frameId = setInterval(() => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.045;
        p.life -= 0.012;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      ctx.globalAlpha = 1;
    }, 30);

    return () => {
      clearInterval(burstId);
      clearInterval(frameId);
    };
  }, []);

  return (
    <div
      data-testid="retro-fireworks"
      style={{ position: "fixed", inset: 0, zIndex: 75, background: "#000", overflow: "hidden" }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0 }} />
      <div
        className="retro-blink"
        style={{
          position: "absolute",
          bottom: "12%",
          width: "100%",
          textAlign: "center",
          color: "#ffff55",
          fontSize: "1.5em",
        }}
      >
        * CHEAT ACTIVATED: GOOD TIMES MODE *
      </div>
    </div>
  );
}
