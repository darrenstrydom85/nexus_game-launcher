/**
 * Ordered-dither an image down to the 16-color VGA palette as a grid of
 * colored block cells, for ANSI-style cover art in retro mode.
 */

/** The classic VGA 16 as [r, g, b, css]. */
export const VGA16: [number, number, number, string][] = [
  [0x00, 0x00, 0x00, "#000000"],
  [0x00, 0x00, 0xaa, "#0000aa"],
  [0x00, 0xaa, 0x00, "#00aa00"],
  [0x00, 0xaa, 0xaa, "#00aaaa"],
  [0xaa, 0x00, 0x00, "#aa0000"],
  [0xaa, 0x00, 0xaa, "#aa00aa"],
  [0xaa, 0x55, 0x00, "#aa5500"],
  [0xaa, 0xaa, 0xaa, "#aaaaaa"],
  [0x55, 0x55, 0x55, "#555555"],
  [0x55, 0x55, 0xff, "#5555ff"],
  [0x55, 0xff, 0x55, "#55ff55"],
  [0x55, 0xff, 0xff, "#55ffff"],
  [0xff, 0x55, 0x55, "#ff5555"],
  [0xff, 0x55, 0xff, "#ff55ff"],
  [0xff, 0xff, 0x55, "#ffff55"],
  [0xff, 0xff, 0xff, "#ffffff"],
];

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function nearestVga(r: number, g: number, b: number): string {
  let best = VGA16[0][3];
  let bestDist = Infinity;
  for (const [pr, pg, pb, css] of VGA16) {
    // Perceptual-ish weights; good enough for 16 targets.
    const dist =
      2 * (r - pr) * (r - pr) + 4 * (g - pg) * (g - pg) + 3 * (b - pb) * (b - pb);
    if (dist < bestDist) {
      bestDist = dist;
      best = css;
    }
  }
  return best;
}

/** Quantize one cell with a Bayer 4x4 threshold offset for the dither look. */
export function ditherCell(r: number, g: number, b: number, x: number, y: number): string {
  const offset = (BAYER4[y % 4][x % 4] / 16 - 0.5) * 48;
  const clamp = (v: number) => Math.max(0, Math.min(255, v + offset));
  return nearestVga(clamp(r), clamp(g), clamp(b));
}

/**
 * Draw the image at cols x rows and quantize each pixel.
 * Returns null when a 2d context is unavailable or the canvas is tainted
 * (cross-origin image without CORS) — caller shows a fallback.
 */
export function ditherImage(img: HTMLImageElement, cols: number, rows: number): string[][] | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = cols;
    canvas.height = rows;
    const ctx = canvas.getContext?.("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, cols, rows);
    const data = ctx.getImageData(0, 0, cols, rows).data;
    const grid: string[][] = [];
    for (let y = 0; y < rows; y++) {
      const row: string[] = [];
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        row.push(ditherCell(data[i], data[i + 1], data[i + 2], x, y));
      }
      grid.push(row);
    }
    return grid;
  } catch {
    return null;
  }
}
