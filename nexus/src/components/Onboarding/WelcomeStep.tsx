import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { Button } from "@/components/ui/button";
import { Search, FolderOpen, Play } from "lucide-react";

const PANELS = [
  { icon: <Search className="size-8" />, title: "Scan", desc: "Auto-detect games from all your launchers" },
  { icon: <FolderOpen className="size-8" />, title: "Organize", desc: "One unified library with rich metadata" },
  { icon: <Play className="size-8" />, title: "Play", desc: "Launch any game with a single click" },
];

export function WelcomeStep() {
  const goNext = useOnboardingStore((s) => s.goNext);
  const [activePanel, setActivePanel] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setActivePanel((p) => (p + 1) % PANELS.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div data-testid="welcome-step" className="flex max-w-lg flex-col items-center gap-8 text-center">
      {/* Logo */}
      <motion.div
        data-testid="welcome-logo"
        className="flex size-20 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground shadow-[0_0_40px_var(--glow)]"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        N
      </motion.div>

      <motion.h1
        className="text-3xl font-bold tracking-tight text-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Welcome to Nexus
      </motion.h1>

      <p data-testid="welcome-tagline" className="text-lg text-muted-foreground">
        All your games. One place.
      </p>

      {/* Three-panel sequence */}
      <div data-testid="welcome-panels" className="flex gap-4">
        {PANELS.map((panel, i) => (
          <button
            key={panel.title}
            data-testid={`welcome-panel-${i}`}
            className={cn(
              "flex w-36 flex-col items-center gap-2 rounded-lg border p-4 transition-all",
              activePanel === i
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/30",
            )}
            onClick={() => setActivePanel(i)}
          >
            {panel.icon}
            <span className="text-sm font-semibold">{panel.title}</span>
            <span className="text-xs">{panel.desc}</span>
          </button>
        ))}
      </div>

      <Button
        data-testid="welcome-start"
        size="lg"
        className="mt-4"
        onClick={goNext}
      >
        Let's get started
      </Button>

    </div>
  );
}
