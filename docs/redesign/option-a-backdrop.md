# Option A — "Backdrop" (Cinematic / Art-first)

**One-liner:** the game's own key art becomes the interface. Nexus stops looking like a
dashboard that happens to contain games and starts looking like a home theater for your library.
Closest relatives: PS5 home, Netflix profile rows, Apple TV — but denser and mouse-first.

## Why it stops looking AI

- Kills the card-grid-in-a-frame dashboard grammar. The dominant surface is **full-bleed hero art**
  with content floating over it, not white/black panels with purple accents.
- Color comes from the **game, not the theme**: `useDominantColor` (already in the codebase) tints
  buttons, progress bars, and the ambient background per selected game. No fixed purple anywhere.
- Glassmorphism is demoted from "every surface" to **one deliberate layer**: the scrim gradient that
  keeps text legible over art. Everything else is flat ink.
- Typography gets a voice: a condensed display face for game titles and section headers
  (e.g. **Archivo Expanded/Condensed**, **Barlow Condensed**, or licensed equivalent), Geist stays
  for body/UI. Big, tight, cinematic.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar (unchanged, transparent over art)                   │
├────┬─────────────────────────────────────────────────────────┤
│ R  │  ███████████ FULL-BLEED HERO (selected/last game) ██████ │
│ A  │  ██  scrim gradient ▼                              █████ │
│ I  │  GAME TITLE (display face, 64px)                        │
│ L  │  2h since Tuesday · 34% · ▶ PLAY   ⓘ Details            │
│    │                                                         │
│ 64 │  CONTINUE PLAYING  ────────────────── (shelf, scrolls →) │
│ px │  [art][art][art][art][art]                              │
│    │                                                         │
│    │  ALL GAMES · 142        [filter pills] [sort] [grid/row] │
│    │  [art][art][art][art][art][art][art]                    │
│    │  [art][art][art][art][art][art][art]                    │
└────┴─────────────────────────────────────────────────────────┘
```

- **Sidebar → icon rail (64px, fixed).** Nav icons + level ring + streak flame + settings.
  Hover/click a rail icon expands a **flyout panel** (280px, over content, not pushing it) containing
  what the old expanded sidebar held: collections, genres, tags, score slider, sources, play queue.
  Rail is the only permanent chrome; art gets the rest.
- **Hero = state, not decoration.** Selecting any card retargets the hero (art, dominant-color tint,
  play stats, Play button). Keyboard ←→ moves selection like a console.
- **Shelves before grid:** Continue Playing (exists today) plus optional shelves the data already
  supports — "Almost mastered", "In your queue", "Live on Twitch now". Grid remains below for
  browse-everything; density toggle (cover-only vs cover+meta row).
- **Now Playing** becomes a bottom-left floating capsule over the art (already exists for <800px —
  promote that pattern to always-on when a session is active).

## Per-view treatment

| View | Treatment |
|---|---|
| Library | As above — hero + shelves + grid |
| Game Detail | Already overlay — goes **full-screen takeover**: hero art top 60%, dominant-color-tinted action bar, content columns below (progress/sessions left, meta/HLTB/Twitch right). Trailer plays muted in hero on idle (respect no-animations). |
| Stats | Dark editorial: charts recolored to dominant neutral + single per-chart accent; heatmap becomes the page hero. Keep all charts. |
| Achievements | Rarity color as **edge-light on art tiles** rather than chip badges. |
| Completed / Archive | Same shelf/grid language, desaturated art for archive. |
| Twitch | Stream thumbnails get the shelf treatment; channel detail reuses takeover pattern. |
| Wrapped / Ceremony | Already cinematic — mostly untouched, wins for free from new type scale. |
| Settings / modals | Flat ink panels (no glass), same structure. Sheet slides over dimmed art. |
| Onboarding | Full-bleed slideshow of hero art (bundled samples), same steps. |

## Functionality mapping (deltas only — everything else 1:1)

- Sidebar accordions → rail flyouts (same components, new container).
- Sync banner → thin progress line under titlebar + rail dot (SyncActivityDot survives).
- Five toast systems → unchanged positions, restyled to ink + dominant-color accent.
- Nav ids (`library`, `stats`, …) unchanged → tray navigation keeps working.

## Technical notes

- Token system survives: hero tint is a **runtime token** (`--game-accent`) set by `useDominantColor`;
  ThemeStudio still controls the base neutrals. Light theme = light scrim variant.
- `no-transparency` pref: scrim becomes solid panel. `no-animations`: hero crossfades off.
- Biggest new work: rail + flyout shell (replaces AppShell/Sidebar layout), hero-selection state in
  uiStore, shelf component. Grid, cards, detail content largely restyled not rebuilt.

**Effort: ~L (largest of the four).** Highest wow ceiling; most layout risk.
**Choose if:** you want the launcher to feel like a console/theater and are happy for art to do the talking.
