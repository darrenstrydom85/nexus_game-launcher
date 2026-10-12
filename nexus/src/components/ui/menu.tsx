import * as React from "react";
import * as Radix from "radix-ui";
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Right-click (ContextMenu) and button (DropdownMenu) menus share one look.
 * Radix gives both keyboard navigation, submenus that open on click, hover and
 * arrow keys, collision handling and layered Escape.
 */

const CONTENT =
  "z-50 min-w-[200px] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg ease-out " +
  "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-[160ms] " +
  "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100";

const ITEM =
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none " +
  "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 " +
  "[&_svg]:size-4 [&_svg]:shrink-0";

type Parts = typeof Radix.ContextMenu | typeof Radix.DropdownMenu;
type ContentProps = React.ComponentPropsWithoutRef<typeof Radix.DropdownMenu.Content>;

const CONTEXT_ORIGIN = "origin-(--radix-context-menu-content-transform-origin)";
const DROPDOWN_ORIGIN = "origin-(--radix-dropdown-menu-content-transform-origin)";

// ponytail: both Radix menus share part names, so one factory styles both.
function makeContent(P: Parts, origin: string) {
  // The two Content types differ only in positioning props.
  const R = P as typeof Radix.DropdownMenu;
  const Content = React.forwardRef<HTMLDivElement, ContentProps>(({ className, ...props }, ref) => (
    <R.Portal>
      <R.Content ref={ref} className={cn(CONTENT, origin, className)} {...props} />
    </R.Portal>
  ));
  Content.displayName = "MenuContent";
  return Content;
}

export const ContextMenu = Radix.ContextMenu.Root;
export const ContextMenuTrigger = Radix.ContextMenu.Trigger;
export const ContextMenuContent = makeContent(Radix.ContextMenu, CONTEXT_ORIGIN);
export const DropdownMenu = Radix.DropdownMenu.Root;
export const DropdownMenuTrigger = Radix.DropdownMenu.Trigger;
export const DropdownMenuContent = makeContent(Radix.DropdownMenu, DROPDOWN_ORIGIN);

type ItemProps = React.ComponentPropsWithoutRef<typeof Radix.DropdownMenu.Item>;
type CheckboxProps = React.ComponentPropsWithoutRef<typeof Radix.DropdownMenu.CheckboxItem>;
type RadioGroupProps = React.ComponentPropsWithoutRef<typeof Radix.DropdownMenu.RadioGroup>;
type RadioItemProps = React.ComponentPropsWithoutRef<typeof Radix.DropdownMenu.RadioItem>;
type SubProps = { children: React.ReactNode; "data-testid"?: string };

/** The parts a shared menu body renders with, so one item list serves both menus. */
export interface MenuParts {
  Item: React.FC<ItemProps>;
  CheckboxItem: React.FC<CheckboxProps>;
  RadioGroup: React.FC<RadioGroupProps>;
  RadioItem: React.FC<RadioItemProps>;
  Separator: React.FC;
  Sub: React.FC<{ children: React.ReactNode }>;
  SubTrigger: React.FC<SubProps>;
  SubContent: React.FC<SubProps>;
}

function makeParts(P: Parts, origin: string): MenuParts {
  const R = P as typeof Radix.DropdownMenu;
  return {
    Item: ({ className, ...props }) => <R.Item className={cn(ITEM, className)} {...props} />,
    CheckboxItem: ({ className, children, ...props }) => (
      <R.CheckboxItem className={cn(ITEM, "pr-8", className)} {...props}>
        {children}
        <R.ItemIndicator className="absolute right-2 flex items-center">
          <Check strokeWidth={2} />
        </R.ItemIndicator>
      </R.CheckboxItem>
    ),
    RadioGroup: (props) => <R.RadioGroup {...props} />,
    RadioItem: ({ className, children, ...props }) => (
      <R.RadioItem className={cn(ITEM, "pr-8", className)} {...props}>
        {children}
        <R.ItemIndicator className="absolute right-2 flex items-center">
          <Check strokeWidth={2} />
        </R.ItemIndicator>
      </R.RadioItem>
    ),
    Separator: () => <R.Separator className="-mx-1 my-1 h-px bg-border" />,
    Sub: ({ children }) => <R.Sub>{children}</R.Sub>,
    SubTrigger: ({ children, ...props }) => (
      <R.SubTrigger className={cn(ITEM, "data-[state=open]:bg-accent")} {...props}>
        {children}
        <ChevronRight className="ml-auto text-muted-foreground" strokeWidth={2} />
      </R.SubTrigger>
    ),
    SubContent: ({ children, ...props }) => (
      <R.Portal>
        <R.SubContent sideOffset={4} className={cn(CONTENT, origin)} {...props}>
          {children}
        </R.SubContent>
      </R.Portal>
    ),
  };
}

export const contextMenuParts = makeParts(Radix.ContextMenu, CONTEXT_ORIGIN);
export const dropdownMenuParts = makeParts(Radix.DropdownMenu, DROPDOWN_ORIGIN);
