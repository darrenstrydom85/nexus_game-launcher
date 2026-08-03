import * as React from "react";

export interface RetroModalItem {
  label: string;
  value?: string;
  /** Single-char hotkey shown as "X - LABEL". */
  hotkey?: string;
  /** Marks the currently-active choice. */
  current?: boolean;
}

export interface RetroModalProps {
  title: string;
  /** Selectable rows. Omit for free-form body via children. */
  items?: RetroModalItem[];
  selected?: number;
  footer: React.ReactNode;
  children?: React.ReactNode;
  onItemClick?: (index: number) => void;
}

/**
 * DOS pseudo-modal: teal popup over dimmed screen. Presentational only —
 * the OWNING screen routes all keyboard input while a modal is open, so
 * there is exactly one keydown listener per screen and no focus fights.
 */
export function RetroModal({ title, items, selected = 0, footer, children, onItemClick }: RetroModalProps) {
  return (
    <div className="retro-popup-overlay" data-testid="retro-modal">
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} />
      <div className="retro-popup" style={{ position: "relative" }}>
        <div style={{ textAlign: "center" }}>{title}</div>
        <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
        {items?.map((item, i) => (
          <div
            key={item.label}
            data-testid={`retro-modal-item-${i}`}
            className={i === selected ? "retro-row retro-row-selected" : "retro-row"}
            style={{ padding: "0 4px" }}
            onMouseDown={() => onItemClick?.(i)}
          >
            {item.hotkey && <span style={{ width: "4ch" }}>{item.hotkey} -</span>}
            <span style={{ flex: 1 }}>{item.label}</span>
            {item.value && <span style={{ width: "10ch", textAlign: "right" }}>{item.value}</span>}
            <span style={{ width: "10ch", textAlign: "right" }}>{item.current ? "<CURRENT" : ""}</span>
          </div>
        ))}
        {children}
        <div style={{ borderTop: "1px solid #000", margin: "2px 0" }} />
        <div>{footer}</div>
      </div>
    </div>
  );
}
