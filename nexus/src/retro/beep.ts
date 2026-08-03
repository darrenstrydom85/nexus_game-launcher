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
  try {
    const c = audioCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start();
    osc.stop(c.currentTime + ms / 1000);
  } catch {
    // no audio device / context blocked — stay silent
  }
}
