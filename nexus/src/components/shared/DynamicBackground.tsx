import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { useDominantColor } from "@/hooks/useDominantColor";

interface DynamicBackgroundProps {
  imageUrl: string | null | undefined;
}

export function DynamicBackground({ imageUrl }: DynamicBackgroundProps) {
  const color = useDominantColor(imageUrl);

  const gradient = React.useMemo(
    () =>
      `radial-gradient(ellipse at 50% 0%, ${color}33 0%, transparent 70%)`,
    [color],
  );

  return (
    <div
      data-testid="dynamic-background"
      className="pointer-events-none fixed inset-0 z-0"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={color}
          data-testid="dynamic-background-gradient"
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <div
            data-testid="dynamic-background-fill"
            data-gradient={gradient}
            className="absolute inset-0"
            style={{
              backgroundImage: gradient,
              willChange: "opacity",
            }}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
