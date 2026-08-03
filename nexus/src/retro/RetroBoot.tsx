import * as React from "react";
import { useGameStore } from "@/stores/gameStore";
import { getSystemHardware, type HardwareInfo } from "@/lib/tauri";

/** Cached across mounts so re-entering retro doesn't re-run wmic. */
let cachedHardware: HardwareInfo | null = null;

/**
 * Fake BIOS POST shown when retro mode mounts. Line-by-line typewriter
 * reveal; any key or click skips straight through. Uses the machine's real
 * CPU/GPU names when detection succeeds, era-appropriate fakes otherwise.
 */
export function RetroBoot({ onDone }: { onDone: () => void }) {
  const gameCount = useGameStore((s) => s.games.length);
  const [hw, setHw] = React.useState<HardwareInfo | null>(cachedHardware);

  React.useEffect(() => {
    if (cachedHardware) return;
    getSystemHardware()
      .then((info) => {
        cachedHardware = info;
        setHw(info);
      })
      .catch(() => {});
  }, []);

  const cpu = hw?.cpuName?.trim() ? hw.cpuName.trim() : "80486DX2-66";
  const gpu = hw?.gpuName?.trim() ? hw.gpuName.trim() : "VGA COMPATIBLE ADAPTER 256K";

  const lines = React.useMemo(
    () => [
      "NEXUS PERSONAL GAME SYSTEM",
      "BIOS V2.11  (C) 1992 NEXUS MICROSYSTEMS INC.",
      "",
      `MAIN PROCESSOR : ${cpu}`,
      `VIDEO ADAPTER  : ${gpu}`,
      "MEMORY TEST    : 640K OK",
      "",
      "DETECTING DRIVES ........ OK",
      "MOUNTING GAME LIBRARY ... OK",
      `${gameCount} TITLES FOUND`,
      "",
      "LOADING NEXUS.EXE",
      "OK",
    ],
    [gameCount, cpu, gpu],
  );

  const [shown, setShown] = React.useState(0);
  const doneRef = React.useRef(false);

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  React.useEffect(() => {
    if (shown >= lines.length) {
      const t = setTimeout(finish, 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 200 : 120 + Math.random() * 200);
    return () => clearTimeout(t);
  }, [shown, lines.length, finish]);

  // Any key or click skips. Capture phase so the key never reaches the app.
  React.useEffect(() => {
    const skip = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      finish();
    };
    document.addEventListener("keydown", skip, true);
    document.addEventListener("mousedown", skip, true);
    return () => {
      document.removeEventListener("keydown", skip, true);
      document.removeEventListener("mousedown", skip, true);
    };
  }, [finish]);

  return (
    <div
      data-testid="retro-boot"
      style={{ flex: 1, background: "var(--vga-black)", color: "var(--vga-lgray)", padding: "8px 12px" }}
    >
      {lines.slice(0, shown).map((line, i) => (
        <div key={i} style={{ whiteSpace: "pre" }}>
          {line || " "}
        </div>
      ))}
      <span className="retro-blink">█</span>
    </div>
  );
}
