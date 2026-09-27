# Redesign Baseline — Functionality Inventory & Current-Look Audit

> Purpose: the "must not lose" checklist every redesign option is measured against,
> plus an honest audit of why the current UI reads as generic/AI-generated.
> No option may ship if any item below is missing or degraded.

## 1. Views (main content area, switched by sidebar nav)

| View | Purpose | Key features |
|---|---|---|
| **Library** (default) | Browse + launch games | Hero section, Continue Playing row, game grid, dynamic heading (search/collection/source/genre), sync progress banner + activity dot + error popover, skeleton loading, empty/filtered states, resync button with result toast |
| **Stats** | Aggregate play data | Activity chart, activity heatmap, top games chart, session history, session histogram, streak section + calendar, XP level section + breakdown/over-time charts + history list, mastery tier legend, Twitch watch section, "Open Wrapped" entry |
| **Completed** | Completed games showcase | Completed grid with badge counts |
| **Archive** | Removed/dead games | Archived list; restore/complete flows (status changes on archived games work via `completed` flag) |
| **Achievements** | Achievement gallery | Cards with rarity colors, progress bars, unlock notifications queue, navigate-to-card highlight flash, unlocked badge count in nav |
| **Twitch** | Streams for your games | Connect prompt, followed streams sidebar, channel detail, trending tab, live badges, stream cards, empty states, EventSub live status |
| **Wrapped** | Year-in-review story | Card deck: hero, top game(s), podium, genre, diversity, play patterns, library growth, milestones, Twitch watch, fun extras; dot navigation, period selector, share card + share modal |

## 2. Overlays / modals (all mounted at App level)

- **Game Detail overlay** — hero art, trailer (YouTube embed), action bar (Play/Stop/Force-identify), status + rating editors, progress slider, metadata, HLTB section, screenshots, notes, per-game session panel + session list + patterns charts, milestone list, mastery tier detail, tags section, live-on-Twitch row, Twitch clips row, collections chips, edit/hide/open-folder/refetch/search-metadata actions. Archived-game variant (status via `completed` flag).
- **Settings sheet** — appearance (theme, ThemeStudio custom themes, FontCombobox custom font, reduced motion, no transparency, no animations), library preferences, folder manager, source toggles, API key manager, Twitch settings + diagnostics panel, cloud backup, data management (backup/restore dialog), stats export, library health (dead game rows, health modal), hidden games list, dev settings, about + known issues, update section.
- **Search command palette** (`searchOpen` in uiStore) — game search + actions: settings, random picker, scan, **enter retro mode**.
- **Random picker modal** — roulette spinner, picker result, play/details actions. Also reachable as fake nav item "Random".
- **Collection editor** — create/edit manual + smart collections (rule builder, preset smart collections, icon/color).
- **Add-to-collection popover** (from grid context menu or detail).
- **Edit game modal** — name, exe path, custom cover/hero, potential exe names.
- **Metadata search dialog** — manual IGDB match.
- **Health check modal** — dead games review.
- **Update available dialog** + hourly update toast.
- **Process picker modal** — manual process identify (launch lifecycle + force identify).
- **Session note prompt** — post-session note with auto-dismiss timeout.
- **Retirement ceremony** (Epic 41) — multi-card ceremony (hero, journey, sessions, patterns, mastery, timeline, fun facts, final), certificate card + certificate share modal.
- **Close confirm dialog** (CloseDialogHost — mounted in *every* state incl. onboarding).
- **Onboarding wizard** — welcome, SteamGridDB key, IGDB keys (with key verifier), sources, confirm library; step indicator; pre-skips steps when keys already exist.

## 3. Persistent chrome

- **Custom titlebar** — drag region, window controls, close-to-tray behavior.
- **Sidebar** (240px expanded / 64px collapsed / drawer below 1000px; hidden below 800px with floating Now Playing bar):
  - Now Playing widget (top): active session, elapsed, stop, details, force-identify, play-pulse dot.
  - Level badge (XP) → navigates to Stats.
  - Nav: Library, Stats, Random, Completed (count badge), Archive (count badge), Achievements (unlock count badge), Twitch (live count badge, red dot when collapsed; hidden if twitch disabled).
  - Streak widget (flame with flicker/inferno animation tiers) → Stats.
  - Play Queue widget (queue entries, play from queue, drag likely).
  - Accordions: Collections (manual + smart, edit/delete context), Genres (top 10), Tags (color dot + count), Score range (dual-handle slider), Sources (per-source count, filter toggle).
  - Hardware branding slot, Settings button (health warning dot), collapse toggle.
- **Toast systems** (five!): generic toasts (with actions), Twitch toasts, milestone toast stack, level-up toast, achievement notification queue.
- **Tray navigation** (`nexus://navigate-to` event) — must keep nav ids stable.
- **Native notification actions**, backup-restored refresh flow, score backfill progress toast, auto health check w/ snooze, connectivity recovery refetch, hourly update check.

## 4. Retro mode

Complete alternate DOS-style skin (`src/retro/*`) toggled via settings / search command. Same stores + handlers, different component tree; amber exit screen on leave. **Out of scope for redesign — untouched by all options.** Only constraint: entry/exit paths must survive.

## 5. Cross-cutting constraints (all options must keep)

- Token-driven theming (`:root` / `.dark` CSS vars) — **ThemeStudio edits user themes**, so any new palette must stay token-based and ThemeStudio-compatible.
- Custom font setting (FontCombobox) — type system must tolerate font swap.
- Accessibility prefs: `.no-animations`, `.no-transparency`, `prefers-reduced-motion` honored everywhere.
- Responsive: full ≥1400 / compact ≥1000 / minimal <1000 (drawer + floating now-playing <800).
- Keyboard: search palette shortcut, focus-visible rings, slider keyboard support, aria labels/counts.
- `data-testid` attributes — test suite depends on them; keep ids stable where components survive.
- Light **and** dark theme.

## 6. Current-look audit — why it reads "AI-generated"

The stack is default-shadcn with the usual tells:

1. **Purple primary** (`hsl(272 100% 43%)`) on near-black neutral — the single most common AI-app palette.
2. **Glassmorphism everywhere** (5 glass utility classes, blurred sidebar/overlay/toast) — 2023 template look.
3. **Uniform rounded-lg cards + soft glow tokens** — every surface is the same card.
4. **Geist Sans everywhere** — the default-of-defaults; no typographic voice, no display face, no scale contrast beyond weight.
5. **lucide icon rows in a left sidebar** — indistinguishable from every dashboard starter.
6. **Generic status color set** (green/amber/red/blue chips), tiny pill badges, dot indicators — dashboard grammar, not launcher grammar.
7. **Even spacing, even density** — no hierarchy between "hero moment" (launching a game) and admin chrome (filters). Game art — the strongest visual asset in the app — is boxed into a uniform grid.
8. Hash-hue placeholder gradients on missing covers — random-hue gradients are another tell.

What the app already has going for it (unused leverage):
- **SteamGridDB heroes/covers** — real art direction for free.
- **`useDominantColor` hook** — per-game adaptive color already implemented.
- Rich progression systems (XP, streak, mastery, achievements) that could carry a distinctive identity instead of being sidebar trinkets.
- ThemeStudio — an actual differentiator worth featuring, not burying.
