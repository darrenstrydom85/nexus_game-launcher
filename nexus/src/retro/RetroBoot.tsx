import * as React from "react";
import { useGameStore } from "@/stores/gameStore";
import { getSystemHardware, type HardwareInfo } from "@/lib/tauri";
import { NEXUS_LOGO } from "./logo";

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
  const complete = shown >= lines.length;

  const finish = React.useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  React.useEffect(() => {
    if (complete) {
      // Wait for Enter, but don't block forever — auto-proceed after 5s.
      const t = setTimeout(finish, 5000);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 200 : 120 + Math.random() * 200);
    return () => clearTimeout(t);
  }, [shown, complete, finish]);

  // During the reveal any key/click fast-forwards to the full POST; once
  // complete, Enter (or a click) proceeds. Capture phase so keys never
  // reach the app underneath.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!complete) setShown(lines.length);
      else if (e.key === "Enter") finish();
    };
    const onMouse = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      if (!complete) setShown(lines.length);
      else finish();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onMouse, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onMouse, true);
    };
  }, [complete, lines.length, finish]);

  return (
    <div
      data-testid="retro-boot"
      style={{ flex: 1, background: "var(--vga-black)", color: "var(--vga-lgray)", padding: "8px 12px" }}
    >
      <div style={{ color: "var(--vga-bcyan)", whiteSpace: "pre", lineHeight: 1.05, marginBottom: 8 }}>
        {NEXUS_LOGO.join("\n")}
      </div>
      {lines.slice(0, shown).map((line, i) => (
        <div key={i} style={{ whiteSpace: "pre" }}>
          {line || " "}
        </div>
      ))}
      {complete ? (
        <div className="retro-accent retro-blink" style={{ marginTop: 12 }} data-testid="retro-boot-proceed">
          PRESS ENTER TO PROCEED
        </div>
      ) : (
        <span className="retro-blink">█</span>
      )}
    </div>
  );
}
