import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/**
 * Demo component that verifies AnimatePresence mount/unmount transitions.
 * Renders a toggle button and an animated box that fades in/out.
 */
export function AnimatePresenceToggle() {
  const [visible, setVisible] = useState(true);
  const shouldReduceMotion = useReducedMotion();

  const transition = shouldReduceMotion ? { duration: 0 } : { duration: 0.3 };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
      >
        {visible ? "Hide" : "Show"}
      </button>

      <AnimatePresence>
        {visible && (
          <motion.div
            key="presence-box"
            initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={transition}
            className="h-24 w-24 rounded-lg bg-primary"
            data-testid="presence-box"
          />
        )}
      </AnimatePresence>
    </div>
  );
}
