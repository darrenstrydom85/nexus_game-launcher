import * as React from "react";
import { useSettingsStore } from "@/stores/settingsStore";

export interface RetroSettingsProps {
  enabled: boolean;
  onBack: () => void;
  onExit: () => void;
}

export function RetroSettings({ enabled, onBack, onExit }: RetroSettingsProps) {
  const settings = useSettingsStore();
  const [sel, setSel] = React.useState(0);

  const rows = React.useMemo(
    () => [
      {
        label: "EXIT OLD-SCHOOL MODE (RETURN TO MODERN UI)",
        value: null as string | null,
        run: onExit,
      },
      {
        label: "DESKTOP NOTIFICATIONS",
        value: settings.enableNotifications ? "Y" : "N",
        run: () => settings.setEnableNotifications(!settings.enableNotifications),
      },
      {
        label: "AUTO STATUS TRANSITIONS",
        value: settings.autoStatusTransitions ? "Y" : "N",
        run: () => settings.setAutoStatusTransitions(!settings.autoStatusTransitions),
      },
      {
        label: "SESSION NOTE PROMPT",
        value: settings.sessionNotePromptEnabled ? "Y" : "N",
        run: () => settings.setSessionNotePromptEnabled(!settings.sessionNotePromptEnabled),
      },
      {
        label: "ASK BEFORE CLOSE",
        value: settings.askBeforeClose ? "Y" : "N",
        run: () => settings.setAskBeforeClose(!settings.askBeforeClose),
      },
      {
        label: "AUTO LIBRARY HEALTH CHECK",
        value: settings.autoHealthCheck ? "Y" : "N",
        run: () => settings.setAutoHealthCheck(!settings.autoHealthCheck),
      },
    ],
    [settings, onExit],
  );

  React.useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape": e.preventDefault(); onBack(); break;
        case "ArrowDown": e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)); break;
        case "ArrowUp": e.preventDefault(); setSel((s) => Math.max(0, s - 1)); break;
        case "Enter":
        case " ": e.preventDefault(); rows[sel].run(); break;
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [enabled, rows, sel, onBack]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }} data-testid="retro-settings">
      <div className="retro-panel" style={{ flex: 1 }}>
        <div className="retro-panel-title">SETUP(Y/N)</div>
        <div style={{ height: 8 }} />
        {rows.map((row, i) => (
          <div
            key={row.label}
            data-testid={`retro-settings-row-${i}`}
            className={i === sel ? "retro-row retro-row-selected" : "retro-row"}
            onMouseDown={() => setSel(i)}
            onDoubleClick={() => row.run()}
          >
            <span style={{ width: "3ch" }}>{String.fromCharCode(65 + i)} -</span>
            <span style={{ flex: 1 }}>{row.label}</span>
            <span className="retro-value" style={{ width: "3ch", textAlign: "right" }}>
              {row.value ?? ""}
            </span>
          </div>
        ))}
        <div style={{ height: 12 }} />
        <div className="retro-dim">CHANGES SAVE TO SAME DATABASE AS MODERN UI.</div>
      </div>
    </div>
  );
}
