# Implementation Plan — Experience Selector (Current / Backdrop / Channel)

> Three selectable experiences plus untouched Retro. Approved mockups:
> [mockup-a-backdrop.html](mockup-a-backdrop.html), [mockup-d-channel.html](mockup-d-channel.html).
> Guiding rule (already enforced by Retro): **feature logic lives in stores/shared components;
> an experience is a presentation wrapper.** New features land once, get mounted three times.

## Architecture

```
App.tsx
├─ retroMode?            → RetroApp (unchanged, checked first — wins over experience)
├─ experience "current"  → AppShell (existing, untouched)
├─ experience "backdrop" → BackdropShell
└─ experience "channel"  → ChannelShell
```

- New setting `experience: "current" | "backdrop" | "channel"` in settingsStore
  (persisted via existing settings backend, same as `retroMode` — see
  settingsStore.ts:81/132/537 pattern). Default `"current"` — nobody's launcher changes
  until they opt in.
- All modals, toasts, dialogs, onboarding, CloseDialogHost: stay mounted once in
  `MainApp` exactly as today (App.tsx renders them as siblings of the shell's children).
  The shells only change what wraps `{children}` and how nav is presented.
- `NavItem` ids (uiStore.ts:17) unchanged → tray navigation, SearchCommand actions and
  tests keep working in all experiences.

## New files

```
src/components/experience/
  ExperienceRouter.tsx        # picks shell from settings; ~30 lines
  useGameAccent.ts            # selected game → --game-accent token (wraps useDominantColor)
  useHeroSelection.ts         # shared "selected game" state (uiStore slice)
src/components/Backdrop/
  BackdropShell.tsx           # icon rail + flyout panels + floating NowPlaying capsule
  RailFlyout.tsx              # hosts existing sidebar content (CollectionsSidebar, filters,
                              # PlayQueueWidget, StreakWidget) inside a flyout panel
  BackdropLibrary.tsx         # hero + shelves + grid (reuses GameCard, GameGrid, ContinuePlayingRow data)
  HeroStage.tsx               # full-bleed hero art + scrim + actions
  Shelf.tsx                   # horizontal cover row
src/components/Channel/
  ChannelShell.tsx            # top tabs + bottom status bar
  ChannelLibrary.tsx          # focus row + content rows + "see all" grid page
  FocusRow.tsx                # roving tabindex, arrow-key traversal, scale/outline on focus
  TileRow.tsx                 # generic horizontal row (continue playing, queue, collections)
  StatusBar.tsx               # session strip + streak + level + sync (reuses NowPlaying logic)
```

Existing components deliberately reused, not forked: `GameCard`, `GameGrid`,
`DetailContent`, `Sidebar` accordion children (`CollectionsSidebar`, score slider, tag/genre
lists), `PlayQueueWidget`, `StreakWidget`, `LevelBadge`, `NowPlaying`, every Stats chart,
`AchievementsView`, `TwitchPanel`.

## Store changes (small)

- **settingsStore**: `experience` field + setter + backend persistence (mirror `retroMode`).
- **uiStore**: `selectedGameId: string | null` (hero/focus selection) + setter. Backdrop and
  Channel both read it; Current ignores it.
- **globals.css**: `--game-accent` runtime token (set by `useGameAccent` on the shell root);
  fallback = theme `--primary`, so ThemeStudio and no-art games behave.

## Phases — each independently shippable

### Phase 0 — Switch plumbing (~1 day)
`experience` setting, ExperienceRouter, Appearance settings gains an "Experience" picker
(three preview cards: Current / Backdrop / Channel; Retro stays where it is today).
Backdrop/Channel entries hidden behind the picker but render AppShell until their phases land
(or picker ships in Phase 2). Exit criteria: switching experiences at runtime swaps shells with
zero store resets, retro entry/exit unaffected.

### Phase 1 — Shared visual plumbing (~2–3 days)
`useGameAccent` (wraps existing `useDominantColor`, hooks/useDominantColor.ts:105),
`useHeroSelection`, `--game-accent` token, hero-image resolver (hero.jpg → cover fallback →
placeholder monogram — kill the hash-hue gradients while here). Respect `.no-animations` /
`.no-transparency` / reduced-motion in everything below.

### Phase 2 — Backdrop MVP (~1–1.5 weeks)
BackdropShell (rail + flyouts + capsule) + BackdropLibrary (HeroStage, Continue Playing shelf,
grid below). Stats/Completed/Archive/Achievements/Twitch render their **existing views** inside
the shell. Detail stays the existing overlay for now. Breakpoints: rail is already 64px, so
<1000px keeps rail (drop flyout pin), <800px falls back to existing drawer pattern.
**Ship it** — Backdrop selectable in Settings.

### Phase 3 — Backdrop polish (~1 week, can trail)
Detail as full takeover (same DetailContent, new container), Stats restyle (type scale +
accent), extra shelves (Queue, Live on Twitch), Wrapped/Ceremony inherit type scale.

### Phase 4 — Channel MVP (~1–1.5 weeks)
ChannelShell (tabs + StatusBar) + ChannelLibrary (FocusRow with keyboard traversal,
TileRows for Continue Playing / Queue / per-collection, "See all" grid page hosting existing
filters in a popover panel). Other views: existing components inside the shell. **Ship it.**

### Phase 5 — Channel polish (~1 week, can trail)
Detail takeover with section cards, Stats profile header (level ring / streak / week bars),
trophy-room Achievements grouping, spring motion (motion/react already installed) with
reduced-motion snaps.

## Rules that keep this maintainable

1. A shell never calls `invoke` or mutates game state — it receives the same handler props
   AppShell gets today (App.tsx:662–680). New feature = shared component + one mount per shell.
2. No forked view logic: if Backdrop needs a variant of a view, it wraps the shared component;
   the moment a fork is tempting, the changing part moves down into the shared component.
3. Keep `data-testid`s on shared components; new shells get their own ids
   (`backdrop-shell`, `channel-focus-row`, …) with shell-parameterized smoke tests.
4. Tokens only — no hardcoded colors in shells; `--game-accent` + existing theme tokens, so
   ThemeStudio, light theme and custom fonts keep working in all three experiences.

## Risks

- **Focus-row a11y/keyboard** (Channel) is the hardest single piece — roving tabindex,
  scroll-into-view, wheel horizontal scroll. Budgeted inside Phase 4; do it first there.
- **Hero art quality varies** (some games have no hero.jpg — e.g. Outlaws/BF6 in the mockups).
  Phase 1's resolver + a subtle blurred-cover fallback covers it.
- **Testing surface** = 3 experiences × 2 themes × 3 breakpoints. Contained by MVP phases
  reusing existing views (their tests already cover behavior); add one shell-level smoke test
  per experience, not per view.
- **Perf**: hero images are large; lazy-load hero on selection change, keep grid virtualized
  behavior as-is.

## Sign-off

Approve phases 0–2 to start (Backdrop first), 4 queued behind it. Branch per phase off a
`feat/experience-selector` integration branch; PR gates: existing test suite green + shell
smoke tests.
