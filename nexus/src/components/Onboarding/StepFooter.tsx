import * as React from "react";
import { createPortal } from "react-dom";

/** Footer buttons: v1 height and radius, with the standard focus ring. */
export const FOOTER_BUTTON = "h-10 rounded-lg px-4 has-[>svg]:px-4 focus-visible:ring-2 focus-visible:ring-ring";
export const FOOTER_PRIMARY = `${FOOTER_BUTTON} px-5 has-[>svg]:px-5 font-semibold`;

interface FooterSlot {
  /** The element in the wizard's pinned footer that step actions render into. */
  target: HTMLElement | null;
  /** Tells the wizard a step supplies its own primary action; returns the release. */
  claim: () => () => void;
}

export const FooterSlotContext = React.createContext<FooterSlot | null>(null);

/**
 * A step's own footer actions (its primary button and any status beside it).
 * Inside the wizard they render into the pinned footer, after Back and
 * "Skip for now"; rendered on their own (tests, previews) they sit inline.
 */
export function StepFooter({ children }: { children: React.ReactNode }) {
  const slot = React.useContext(FooterSlotContext);
  const claim = slot?.claim;
  React.useLayoutEffect(() => claim?.(), [claim]);

  if (!slot) return <div className="mt-8 flex flex-wrap items-center justify-end gap-3">{children}</div>;
  return slot.target ? createPortal(children, slot.target) : null;
}

/** Short muted line beside the primary action, e.g. why it is unavailable. */
export function FooterNote({ id, children, ...rest }: React.ComponentPropsWithoutRef<"p">) {
  return (
    <p id={id} className="min-w-0 text-[13px] text-muted-foreground" {...rest}>
      {children}
    </p>
  );
}
