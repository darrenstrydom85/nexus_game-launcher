import * as React from "react";
import "@fontsource/vt323";
import "./retro.css";
import { Titlebar } from "@/components/shared/Titlebar";

/**
 * Shown for a beat after leaving retro mode: the classic Windows shutdown
 * screen, amber on black. Any key or click skips straight to the modern UI.
 */
export function RetroExitScreen({ onDone }: { onDone: () => void }) {
  const doneRef = React.useRef(onDone);
  doneRef.current = onDone;

  React.useEffect(() => {
    const t = setTimeout(() => doneRef.current(), 1800);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }} data-testid="retro-exit">
      <Titlebar />
      <div
        className="retro-root"
        style={{ flex: 1, minHeight: 0, alignItems: "center", justifyContent: "center", display: "flex" }}
      >
        <span className="retro-blink" style={{ color: "#ffaa00", fontSize: "1.6em", textAlign: "center" }}>
          IT IS NOW SAFE TO TURN OFF
          <br />
          YOUR COMPUTER
        </span>
      </div>
    </div>
  );
}
