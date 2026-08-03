import * as React from "react";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { ditherImage } from "./dither";

// Character cells are ~1:2 (w:h); 26 cols at 3:4 cover aspect lands ~17 rows.
const COLS = 26;
const ROWS = 17;

/**
 * Cover CDNs (SteamGridDB, IGDB) don't send CORS headers, so loading them
 * straight into an <img> taints the canvas (or fails outright with
 * crossOrigin set). Instead fetch the bytes — tauri http plugin for
 * remote urls (CORS-free, scoped in capabilities), webview fetch for
 * asset:/data: — and feed the canvas a same-origin blob: url.
 */
async function toBlobUrl(url: string): Promise<string> {
  const res = url.startsWith("http") ? await tauriFetch(url) : await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/**
 * ANSI-dithered cover art: loads the cover, downsamples to a VGA-16 block
 * grid. Falls back to a NO SIGNAL card when the image can't be read.
 */
export function RetroCover({ url, name }: { url: string | null; name: string }) {
  const [grid, setGrid] = React.useState<string[][] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setGrid(null);
    setFailed(false);
    if (!url) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;

    toBlobUrl(url)
      .then(
        (blobUrl) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            objectUrl = blobUrl;
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("decode failed"));
            img.src = blobUrl;
          }),
      )
      .then((img) => {
        if (cancelled) return;
        const g = ditherImage(img, COLS, ROWS);
        if (g) setGrid(g);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="retro-panel" style={{ flexShrink: 0 }} data-testid="retro-cover">
      <div className="retro-panel-header"><span>COVER</span></div>
      {grid ? (
        // ponytail: ~440 spans per cover; merge same-color runs if this ever drags.
        <div style={{ lineHeight: 1, fontSize: 12 }} aria-label={`Cover art for ${name}`}>
          {grid.map((row, y) => (
            <div key={y} style={{ whiteSpace: "pre" }}>
              {row.map((color, x) => (
                <span key={x} style={{ color }}>█</span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div
          data-testid="retro-cover-fallback"
          className="retro-dim"
          style={{
            width: `${COLS}ch`,
            height: `${ROWS}em`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            fontSize: 12,
          }}
        >
          {failed ? "NO SIGNAL" : "TUNING..."}
        </div>
      )}
    </div>
  );
}
