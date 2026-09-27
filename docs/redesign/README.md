# Nexus UI Redesign — Options for Sign-off

> **Status:** A (Backdrop) + D (Channel) approved as selectable experiences alongside
> Current, Retro untouched. See **[implementation-plan.md](implementation-plan.md)**.

Goal: keep 100% of current functionality, lose the generic "AI-generated" look, land somewhere
genuinely impressive. Four distinct directions below — pick one (or a hybrid) before any code moves.

Baseline first: **[00-inventory.md](00-inventory.md)** — the complete must-not-lose functionality
checklist and the audit of why the current UI reads as template output (default shadcn: purple
primary, glassmorphism, uniform rounded cards, Geist-everywhere, lucide sidebar). Every option was
written against that checklist. Retro mode is untouched by all options.

## Mockups (open in browser)

Shortlisted **A and D** now have 10 screens each (Library, Detail, Stats, Achievements,
Twitch, Settings, Search, Random Picker, Wrapped, Onboarding) using the **real library** —
actual games, playtimes, streak, level and cached SteamGridDB artwork read from the local
Nexus DB (art loads via `file://` from `%APPDATA%/nexus/cache/images`, so open these on
this machine):

- [mockup-a-backdrop.html](mockup-a-backdrop.html) — shortlisted, real data
- [mockup-d-channel.html](mockup-d-channel.html) — shortlisted, real data

B and C remain 4-screen placeholder-art versions:

- [mockup-b-instrument.html](mockup-b-instrument.html)
- [mockup-c-monograph.html](mockup-c-monograph.html)

## The options

| | Direction | Feel | Shell change | Effort | Risk |
|---|---|---|---|---|---|
| **A** | [Backdrop](option-a-backdrop.md) — cinematic, art-first | PS5 / Apple TV home theater | Sidebar → icon rail + flyouts; full-bleed hero | L | Highest wow, most layout risk |
| **B** | [Instrument](option-b-instrument.md) — dense, flat, numerate | Linear / classic Steam / terminal | None — reskin + new list view | S–M | Lowest risk, quietest wow |
| **C** | [Monograph](option-c-monograph.md) — editorial, print, light-first | Criterion shelf / museum catalogue | Sidebar → top nav + filter drawer | M | Most distinctive, light-first is a taste call |
| **D** | [Channel](option-d-channel.md) — console dashboard | Xbox / Switch home | Sidebar → top tabs + bottom bar; horizontal rows | M–L | Most "launcher-native", most interaction work |

## How they differ at a glance

- **Where color comes from:** A/D — the selected game's art (`useDominantColor`, already built).
  B — one utilitarian signal accent. C — paper + ink, near-monochrome.
- **What happens to the sidebar:** B keeps it (retyped), A shrinks it to a rail, C and D remove it.
- **Hero asset:** A/D lean on SteamGridDB art; B leans on your stats/numbers; C leans on typography.
- **Theme default:** A/B/D dark-first, C light-first (all keep both themes + ThemeStudio).

## Shared commitments (all options)

- Token-based theming preserved — ThemeStudio, custom fonts, light+dark all keep working.
- `no-animations` / `no-transparency` / reduced-motion prefs honored.
- Nav ids stable → tray menu navigation unaffected. Test ids kept where components survive.
- Responsive tiers (≥1400 / ≥1000 / <1000) re-specified per option, never dropped.
- Retro mode, onboarding steps, all five toast/notification systems, every modal: retained.

## Sign-off

Reply with one of:
1. **"Option X"** — proceed to detailed implementation plan for that direction (phased, shippable steps).
2. **"Option X but…"** — hybrid tweaks (e.g. "B's list view inside A", "C but dark-first").
3. **Questions / want mockups** — can produce HTML mockups of the Library view per direction before committing.

No code changes until you pick.
