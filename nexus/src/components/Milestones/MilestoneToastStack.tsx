import { AnimatePresence } from "motion/react";
import { useMilestoneStore } from "@/stores/milestoneStore";
import { MilestoneToast } from "./MilestoneToast";
import { useSettingsStore } from "@/stores/settingsStore";

const MAX_VISIBLE = 3;

export function MilestoneToastStack() {
  const toastQueue = useMilestoneStore((s) => s.toastQueue);
  const dismissToast = useMilestoneStore((s) => s.dismissToast);
  const milestoneSoundsEnabled = useSettingsStore(
    (s) => s.milestoneSoundsEnabled,
  );

  const visibleToasts = toastQueue.slice(0, MAX_VISIBLE);

  return (
    <div
      data-testid="milestone-toast-stack"
      className="fixed bottom-20 right-4 z-30 flex flex-col-reverse gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence>
        {visibleToasts.map((item, index) => (
          <MilestoneToast
            key={item.id}
            milestone={item.milestone}
            index={index}
            onDismiss={() => {
              dismissToast(item.id);
              if (milestoneSoundsEnabled && index === 0 && toastQueue.length > MAX_VISIBLE) {
                playMilestoneSound();
              }
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

let audioCache: HTMLAudioElement | null = null;

function playMilestoneSound() {
  try {
    if (!audioCache) {
      audioCache = new Audio("/sounds/milestone.mp3");
      audioCache.volume = 0.4;
    }
    audioCache.currentTime = 0;
    audioCache.play().catch(() => {});
  } catch {
    // autoplay restriction — silent fail
  }
}

export function triggerMilestoneSound(enabled: boolean) {
  if (!enabled) return;
  playMilestoneSound();
}
