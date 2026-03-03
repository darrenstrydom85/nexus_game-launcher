import * as React from "react";

interface RGB {
  r: number;
  g: number;
  b: number;
}

const colorCache = new Map<string, string>();

function medianCutQuantize(pixels: Uint8ClampedArray, k: number): RGB[] {
  const colors: RGB[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    colors.push({ r: pixels[i], g: pixels[i + 1], b: pixels[i + 2] });
  }

  if (colors.length === 0) return [{ r: 30, g: 30, b: 40 }];

  function getRange(bucket: RGB[]): { channel: "r" | "g" | "b"; range: number } {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (const c of bucket) {
      if (c.r < rMin) rMin = c.r;
      if (c.r > rMax) rMax = c.r;
      if (c.g < gMin) gMin = c.g;
      if (c.g > gMax) gMax = c.g;
      if (c.b < bMin) bMin = c.b;
      if (c.b > bMax) bMax = c.b;
    }
    const rRange = rMax - rMin;
    const gRange = gMax - gMin;
    const bRange = bMax - bMin;
    if (rRange >= gRange && rRange >= bRange) return { channel: "r", range: rRange };
    if (gRange >= bRange) return { channel: "g", range: gRange };
    return { channel: "b", range: bRange };
  }

  function average(bucket: RGB[]): RGB {
    let r = 0, g = 0, b = 0;
    for (const c of bucket) {
      r += c.r;
      g += c.g;
      b += c.b;
    }
    const n = bucket.length;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }

  let buckets: RGB[][] = [colors];

  while (buckets.length < k) {
    let maxRange = -1;
    let splitIdx = 0;
    for (let i = 0; i < buckets.length; i++) {
      const { range } = getRange(buckets[i]);
      if (range > maxRange) {
        maxRange = range;
        splitIdx = i;
      }
    }
    if (maxRange === 0) break;

    const bucket = buckets[splitIdx];
    const { channel } = getRange(bucket);
    bucket.sort((a, b) => a[channel] - b[channel]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(splitIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  return buckets.map(average);
}

export function extractDominantColor(imageUrl: string): Promise<string> {
  const cached = colorCache.get(imageUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve("rgb(30, 30, 40)");
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;
      const palette = medianCutQuantize(data, 3);
      const dominant = palette[0];
      const color = `rgb(${dominant.r}, ${dominant.g}, ${dominant.b})`;
      colorCache.set(imageUrl, color);
      resolve(color);
    };
    img.onerror = () => {
      resolve("rgb(30, 30, 40)");
    };
    img.src = imageUrl;
  });
}

export function useDominantColor(imageUrl: string | null | undefined): string {
  const [color, setColor] = React.useState("rgb(30, 30, 40)");

  React.useEffect(() => {
    if (!imageUrl) {
      setColor("rgb(30, 30, 40)");
      return;
    }

    const cached = colorCache.get(imageUrl);
    if (cached) {
      setColor(cached);
      return;
    }

    let cancelled = false;
    extractDominantColor(imageUrl).then((c) => {
      if (!cancelled) setColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  return color;
}

export function clearColorCache() {
  colorCache.clear();
}

export function getColorCacheSize(): number {
  return colorCache.size;
}
