# Option B — "Instrument" (Dense / Utilitarian / Enthusiast-grade)

**One-liner:** Nexus as a precision tool for people who track their play. Flat, dense,
hairline-ruled, numerate. Closest relatives: Linear, classic Steam library, a Bloomberg
terminal that respects you, mechanical-watch dials. The anti-glassmorphism option.

## Why it stops looking AI

- AI defaults are soft: glass, glow, rounded-xl, purple. Instrument is **hard**: square-ish corners
  (2–4px max), 1px hairline borders, zero blur, zero glow, one accent used sparingly.
- **Numbers become the identity.** Playtime, streaks, XP, mastery, scores set in a proper tabular
  mono (Geist Mono is already loaded and unused outside code) — right-aligned columns, baseline
  grids, unit suffixes. Dashboards fake density; this earns it.
- Accent color: default is a utilitarian signal color (safety orange `#FF5C00`, phosphor green, or
  chrome yellow — decided in sign-off) instead of purple; still a token, still ThemeStudio-editable.
- Icons shrink and lose the icon-row look: nav becomes **text labels** (small caps, tracked out),
  which instantly reads "designed" rather than "generated".

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar · NEXUS ────────────── sync ▪ 142 games · lvl 27 ▪  │
├──────────────┬───────────────────────────────────────────────┤
│ LIBRARY      │ ALL GAMES 142            SORT: RECENT ▾  ⊞ ≣  │
│ STATS        │ ┌────────────────────────────────────────────┐│
│ COMPLETED 38 │ │ ▍Hades II          Steam  rogue  94  41:20 ││
│ ARCHIVE   12 │ │ ▍Factorio          Steam  sim    96 812:04 ││
│ ACHIEVEMENTS │ │ ▍Alan Wake 2       Epic   horror 89  12:11 ││
│ TWITCH   ●3  │ │  …                                         ││
│ ──────────── │ └────────────────────────────────────────────┘│
│ QUEUE     4  │  or cover-grid mode (⊞) — same data density   │
│ COLLECTIONS  │                                               │
│ FILTERS      │                                               │
│ ──────────── │                                               │
│ ▶ Hades II   │                                               │
│   00:41:12 ■ │                                               │
└──────────────┴───────────────────────────────────────────────┘
```

- **Sidebar stays but is retyped**: text-label nav (small caps), counts right-aligned mono,
  hairline separators, no icons except status dots. Same widgets (queue, streak, collections,
  filter accordions) — restyled, not moved. Now Playing docks to sidebar **bottom** as a
  persistent session strip with a live mono timer.
- **List view becomes first-class** alongside the cover grid (grid survives untouched as ⊞ mode).
  Rows: status tick, name, source, genre, score, playtime — sortable columns. This is the single
  biggest "for enthusiasts, by enthusiasts" signal and is cheap (data all present in `Game`).
- **Titlebar grows a status band**: game count, level, sync state, connectivity — the app wears its
  instrumentation.
- Density: compact by default, `comfortable` toggle in appearance settings.

## Per-view treatment

| View | Treatment |
|---|---|
| Library | Header strip + list/grid switch; filter pills inline above content (sidebar accordions remain the power path) |
| Game Detail | Overlay becomes a **two-column dossier**: left = cover + actions + status/rating/progress; right = ruled data sections (sessions table!, HLTB, metadata, milestones, tags). Sessions get real table treatment — the richest payoff of this direction. |
| Stats | The flagship view. Ruled chart grid, mono axes, heatmap as punch-card, stat blocks with big mono figures. All existing charts survive recolored. |
| Achievements | Ledger rows with rarity tick + progress meter; gallery grid optional. |
| Twitch | Channel rows with live dot + viewer count mono; thumbnails on hover/detail. |
| Wrapped / Ceremony | Keep their showmanship — they're events, not chrome. Retype numerals to mono for continuity. |
| Settings | Already accordion-based — near-free restyle. |
| Onboarding | Stepper becomes numbered rule (01 → 05), same steps. |

## Functionality mapping (deltas only)

- Everything keeps its position; this is a **reskin + one new list mode**, not a re-architecture.
- Glass classes (`glass-*`) deleted; `no-transparency` pref becomes a no-op (already satisfied).
- Badges (live count, archive count, achievements) become right-aligned mono counts — same data,
  same testids.
- Hash-gradient placeholders → flat neutral panel + mono monogram of the title.

## Technical notes

- Lowest-risk option: AppShell/Sidebar/GameGrid DOM survives; changes are tokens, type, borders,
  and one new `GameListRow` component + sort state in filterStore.
- Token system: swap radius/`--glow`/glass tokens, add `--accent-signal`; ThemeStudio keeps working.
- Light theme looks *great* in this direction (ruled paper), dark looks like a terminal — both cheap.

**Effort: ~S–M (smallest of the four).**
**Choose if:** the tracker/stats identity is the soul of Nexus and you want maximum polish per hour.
