# Option D — "Channel" (Console Dashboard / Ten-foot energy at two feet)

**One-liner:** Nexus as a first-party console home screen — horizontal focus row, oversized
tiles, one game always "selected" with an ambient response from the whole screen. Closest
relatives: Xbox Series home, Switch 2 menu, Steam Big Picture / Deck UI — tuned for mouse +
keyboard at desktop distance.

## Why it stops looking AI

- Dashboards (and AI output) are **vertical**: sidebar + scrolling grid. Consoles are
  **horizontal**: a focus row you traverse, with selection as the primary interaction. Changing
  the axis alone breaks the template look.
- **Focus is the aesthetic.** The selected tile scales up, gains a hard outline (not glow),
  and drives an ambient background wash from its art (`useDominantColor` again). Unselected
  content recedes. AI layouts treat every card equally; consoles have opinionated focus.
- Motion identity: short, physical, spring-based tile movements (motion/react already installed)
  instead of fade-everything. `no-animations` swaps to instant snaps.
- Type: geometric/rounded sans with real weight jumps (e.g. **Space Grotesk** or similar),
  oversized tile labels, no purple — neutral base + per-game ambient color.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar · ambient wash from selected game ░░░░░░░░░░░░░░░░  │
│  ⌂ Library   Stats   Completed   Awards   Twitch      ⌕  ⚙   │  ← top tabs
│                                                              │
│   ┌──────┐ ┌──────┐ ╔════════╗ ┌──────┐ ┌──────┐            │
│   │      │ │      │ ║SELECTED║ │      │ │      │  → focus row│
│   └──────┘ └──────┘ ╚════════╝ └──────┘ └──────┘            │
│              HADES II                                        │
│              41 hrs · 34% · backlog ▸ playing                │
│              [▶ PLAY]  [Details]  [+ Queue]                  │
│                                                              │
│   ROWS: Continue Playing ▸ / Queue ▸ / Collections ▸ / All ▸ │
│   (vertical list of horizontal rows, à la Netflix)           │
├──────────────────────────────────────────────────────────────┤
│ ▶ now playing strip (when active) · streak 🔥12 · lvl 27     │  ← bottom status bar
└──────────────────────────────────────────────────────────────┘
```

- **Top tabs replace sidebar nav** (ids unchanged). Search and settings live right.
- **Bottom status bar** is the persistent home of Now Playing, streak, level, sync dot —
  the "console system bar". Always visible, replaces sidebar widgets.
- **Rows are the content model**: Continue Playing, Play Queue (reorder inline), each Collection
  as a row, All Games as the last (expandable to full grid page for power browsing — grid mode
  survives as "See all"). Row headers jump to filtered full-grid.
- **Filters** (genres/tags/score/sources) live in the All Games grid page toolbar — closer to
  where filtering actually happens; sidebar accordion components reused inside a popover panel.
- Keyboard-first traversal: arrows move focus, Enter launches, `Q` queues — gamepad support
  becomes plausible later (not in scope).

## Per-view treatment

| View | Treatment |
|---|---|
| Library | The home experience above |
| Game Detail | Selection already previews info; Details opens the takeover page (art top, rows of sections below — sessions, milestones, HLTB, Twitch, notes). Same content as today. |
| Stats | Console profile screen: big level/streak header, chart rows beneath. All charts kept. |
| Achievements | Trophy-room rows by rarity; unlock queue becomes console-style top-right pop. |
| Completed / Archive | Rows/grid with dimmed ambient; archive desaturated. |
| Twitch | Fits eerily well: live channels as a media row with viewer counts, trending row below. |
| Wrapped / Ceremony | Full-screen events, untouched structurally. |
| Settings | Console settings list: left category rail inside the sheet (existing accordion content). |
| Onboarding | Console first-boot flow — same steps, big type. |

## Functionality mapping (deltas only)

- Sidebar → top tabs + bottom bar + grid-page filter panel. Every widget relocates, none die:
  level badge & streak → bottom bar; queue → dedicated row + bottom-bar count; collections →
  rows + manager page; score slider/tags/genres/sources → filter panel.
- Now Playing card → bottom-bar strip (stop/details/force-identify as inline buttons).
- Toasts consolidate visually into console notifications (top-right stack), all five queues kept.
- Tray nav ids unchanged.

## Technical notes

- Requires the most **interaction** work (focus row, roving tabindex, scroll-into-view, ambient
  color transitions) but moderate structural work — rows are one component, reused.
- Ambient wash = `--game-accent` runtime token (shared idea with Option A; A and D could share
  that plumbing if you ever wanted to migrate between them).
- Risk: dense libraries (500+ games) need the grid escape hatch to stay first-class — kept.

**Effort: ~M–L.**
**Choose if:** you want Nexus to feel like *playing*, not *managing* — the most "launcher-native"
identity of the four.
