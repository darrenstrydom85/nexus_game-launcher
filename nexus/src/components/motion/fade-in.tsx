import { type ReactNode } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

interface FadeInProps {
  children: ReactNode;
  /** Duration in seconds. Defaults to 0.4 */
  duration?: number;
  /** Delay in seconds before animation starts. Defaults to 0 */
  delay?: number;
  className?: string;
}

export function FadeIn({
  children,
  duration = 0.4,
  delay = 0,
  className,
}: FadeInProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { duration, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
