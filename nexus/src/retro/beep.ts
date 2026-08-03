/**
 * PC-speaker style key beeps via WebAudio square wave. Fire-and-forget;
 * silently no-ops where AudioContext is unavailable (tests, headless).
 */

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function beep(freq = 880, ms = 25, volume = 0.04): void {
  beepAt(freq, ms, volume, 0);
}

/** Like beep() but scheduled `delayMs` in the future on the audio clock. */
function beepAt(freq: number, ms: number, volume: number, delayMs: number): void {
  try {
    const c = audioCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(c.destination);
    const start = c.currentTime + delayMs / 1000;
    osc.start(start);
    osc.stop(start + ms / 1000);
  } catch {
    // no audio device / context blocked — stay silent
  }
}

/** Two-tone POST chime (boot complete). */
export function chime(): void {
  beepAt(880, 90, 0.05, 0);
  beepAt(1318, 160, 0.05, 110);
}

/** Rapid low clicks, like a floppy/HDD seeking during a rescan. */
export function floppySeek(): void {
  let t = 0;
  for (let i = 0; i < 10; i++) {
    beepAt(90 + Math.random() * 120, 18, 0.03, t);
    t += 45 + Math.random() * 60;
  }
}
