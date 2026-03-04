import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { SourceToggles } from "./SourceToggles";
import { FolderManager } from "./FolderManager";
import { APIKeyManager } from "./APIKeyManager";
import { LibraryPreferences } from "./LibraryPreferences";
import { AppearanceSettings } from "./AppearanceSettings";
import { DataManagement } from "./DataManagement";
import { LibraryHealth } from "./LibraryHealth";
import { TwitchSettings } from "./TwitchSettings";
import { AboutSection } from "./AboutSection";
import { useSettingsStore } from "@/stores/settingsStore";

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const hydrated = useSettingsStore((s) => s._hydrated);
  const loadFromBackend = useSettingsStore((s) => s.loadFromBackend);

  React.useEffect(() => {
    if (open && !hydrated) {
      loadFromBackend();
    }
  }, [open, hydrated, loadFromBackend]);

  React.useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-testid="settings-sheet"
          className="fixed inset-0 z-[60] flex justify-end"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <motion.div
            data-testid="settings-panel"
            className="glass-settings relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-semibold text-foreground">Settings</h2>
              <button
                data-testid="settings-close"
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                onClick={onClose}
                aria-label="Close settings"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-6 p-6">
              <Accordion
                type="multiple"
                defaultValue={["library", "appearance", "integrations", "data"]}
                className="w-full"
                data-testid="settings-accordion"
              >
                <AccordionItem value="library" data-testid="settings-group-library">
                  <AccordionTrigger>Library</AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-6">
                    <SourceToggles />
                    <FolderManager />
                    <LibraryPreferences />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="appearance" data-testid="settings-group-appearance">
                  <AccordionTrigger>Appearance</AccordionTrigger>
                  <AccordionContent>
                    <AppearanceSettings />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="integrations" data-testid="settings-group-integrations">
                  <AccordionTrigger>Integrations</AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-6">
                    <APIKeyManager />
                    <TwitchSettings />
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="data" data-testid="settings-group-data">
                  <AccordionTrigger>Data &amp; Health</AccordionTrigger>
                  <AccordionContent className="flex flex-col gap-6">
                    <DataManagement />
                    <LibraryHealth />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              <AboutSection />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
