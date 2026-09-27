# Option C — "Monograph" (Editorial / Print / Gallery)

**One-liner:** your library presented like a beautifully printed monograph or record-shop wall —
big display serif, asymmetric layout, covers treated as artworks with captions, generous white
space. Closest relatives: Criterion Collection shelf, It's Nice That, vinyl library apps, museum
catalogues. The only direction that is *light-first*.

## Why it stops looking AI

- No AI tool ships a **light, serif, print-inspired** desktop app. Dark + glass + purple is the
  generated look; warm paper, ink text, and a display serif (e.g. **Fraunces**, **Newsreader**,
  **Source Serif**) is the designed look.
- **Asymmetry.** Editorial grids break the uniform-card monotony: one featured cover set large,
  supporting covers smaller, captions set in a consistent typographic system (title serif,
  metadata in tiny tracked caps). Repetition with variation, not tile soup.
- **Captions instead of badges.** Source/playtime/score become a set caption line under each cover
  ("STEAM · 41 HRS · 94") instead of floating pills over art — instantly print, instantly calm.
- Rules, folios, and numbering as ornament: thin rules between sections, section numbers
  ("02 — Continue Playing"), page-margin proportions. Zero glow, zero blur, zero gradients.

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar (paper, hairline bottom rule)                       │
├──────────────────────────────────────────────────────────────┤
│ NEXUS   Library  Stats  Completed  Archive  Awards  Twitch ⌕ │  ← top nav, tracked caps
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Continue                    ┌──────────┐  ┌────┐ ┌────┐    │
│  Playing ——— 01              │ FEATURED │  │    │ │    │    │
│                              │  COVER   │  └────┘ └────┘    │
│  Hades II                    │  (large) │  caption  caption │
│  Forty-one hours. 34% seen.  └──────────┘                    │
│  ▶ Resume                     caption                        │
│                                                              │
│  ──────────────────────────────────────────────────────────  │
│  The Library ——— 02 · 142 works        Filter ▾  Sort ▾      │
│  [cover] [cover] [cover] [cover] [cover] [cover]             │
│   caption  caption  caption  caption  caption  caption       │
└──────────────────────────────────────────────────────────────┘
```

- **Sidebar → top navigation bar.** The single biggest de-dashboarding move available. Filters
  (collections, genres, tags, score, sources) relocate to a **filter drawer** under the nav
  (opens as a full-width panel, closes after apply) plus inline filter pills showing active state.
- **Featured slot** at top of Library = most recent game, set editorial-large with a written
  caption line (the data supports composing these: playtime, progress, streak).
- Queue + Now Playing: right-aligned slot in the nav bar ("Now playing — Hades II 00:41 ■") and a
  queue entry in the filter drawer. Below 1000px nav collapses to the existing drawer pattern.
- Dark theme exists but inverts to "ink paper" (warm near-black, cream text) — not neutral black.

## Per-view treatment

| View | Treatment |
|---|---|
| Library | As above — featured + numbered sections + captioned grid |
| Game Detail | **Catalogue page**: cover left like a plate, serif title + written stats paragraph right, ruled sections below (sessions, milestones, notes). Notes finally look at home — like marginalia. |
| Stats | "Annual report" styling: serif headline figures, thin-rule charts, captioned. Heatmap as printed calendar. |
| Achievements | Award catalogue: numbered entries, rarity as small-caps classification ("RARE — 4.2% OF PLAYERS"). |
| Completed | The trophy shelf this direction was born for — completed covers with completion-date folios. |
| Twitch | Programme listing: channel rows set like a radio schedule; thumbnails restrained. |
| Wrapped / Ceremony | Restyle pays off enormously — certificate/ceremony cards become genuinely printable-looking. CertificateCard already exists; it becomes the design language's centerpiece. |
| Settings | Book-index accordion, serif section heads. |
| Onboarding | Frontispiece treatment: "NEXUS — A catalogue of your games", numbered steps. |

## Functionality mapping (deltas only)

- Sidebar nav → top nav: nav ids unchanged (tray nav safe); count badges become small folios.
- Sidebar accordions → filter drawer (same components inside; score slider, tag dots survive).
- Streak/level/queue widgets → nav-bar compact slots + drawer entries; all data retained.
- Five toast systems → bottom-center "slip" notes, restyled only.
- Hash-gradient placeholders → paper panel with serif title lockup (nicer than art in some cases).

## Technical notes

- Layout risk sits in the shell (top nav + drawer replace AppShell sidebar); views themselves are
  restyles. Grid/cards get a caption row added.
- Serif display font bundled locally (Fraunces is OFL). FontCombobox user-font applies to body only.
- Token-compatible: paper/ink palette as `:root` defaults; ThemeStudio still edits tokens.
  `no-transparency`/`no-animations` trivially satisfied (there's nothing transparent to disable).

**Effort: ~M.**
**Choose if:** you want the most *distinctive* option — nobody will mistake it for a template —
and you're comfortable with light-first and a top nav.
