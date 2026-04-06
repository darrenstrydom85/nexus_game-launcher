# Nexus — Game Launcher

**v0.1.21** · All your games. One place.

Nexus is a unified game launcher for Windows that brings together games from **Steam**, **Epic**, **GOG**, **Xbox**, **Battle.net**, **Ubisoft Connect**, and standalone executables into one library. Track play time, organize with collections, enrich with metadata and artwork, and launch any game from a single dark-themed, cinematic interface.

---

## Features

- **Unified library** — Scan and aggregate games from multiple storefronts and custom folders
- **Play tracking** — Automatic session detection and playtime stats with charts
- **Collections** — Custom collections with drag-and-drop ordering
- **Metadata & artwork** — Optional integration with IGDB and SteamGridDB (API keys required) for covers and screenshots
- **Duplicate detection** — Find and resolve duplicate entries across sources
- **Library health** — Check for broken paths, missing executables, and data issues
- **Random picker** — “What should I play?” with filters
- **Custom titlebar** — Frameless window with integrated app chrome
- **Accessibility** — Keyboard navigation, focus management, and WCAG-oriented contrast (see design system)

Built with **Tauri 2**, **React 19**, **TypeScript**, **Tailwind CSS**, and **shadcn/ui**, following a documented design system (Obsidian theme).

---

## Tech Stack

| Layer      | Technologies |
|-----------|--------------|
| **Desktop** | Tauri v2 (Rust) |
| **Frontend** | React 19, TypeScript, Vite 7 |
| **Styling** | Tailwind CSS 4, Radix UI, Geist Sans/Mono |
| **State** | Zustand |
| **Backend** | Rust: rusqlite, reqwest, tokio, winreg, notify |
| **Testing** | Vitest, Testing Library (frontend); `cargo test` (Rust) |

---

## Prerequisites

- **Node.js** 20+ and **npm** (or pnpm/yarn)
- **Rust** (latest stable, e.g. via [rustup](https://rustup.rs))
- **Windows:**
  - [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (for native deps)
  - [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually preinstalled on Windows 11)

---

## Getting Started

The application lives in the **`nexus/`** directory. All commands below are run from there.

### Clone and install

```powershell
cd nexus
npm install
```

### Development

Start the Tauri dev server (Vite + Rust in watch mode):

```powershell
npm run tauri dev
```

The app opens in a window; the frontend hot-reloads at `http://localhost:1420`.

### Build for production

```powershell
npm run tauri build
```

Outputs:
- **NSIS** and **MSI** installers in `nexus/src-tauri/target/release/bundle/`
- Standalone binary in `nexus/src-tauri/target/release/`

### Frontend-only (no Tauri)

```powershell
npm run dev      # Vite dev server
npm run build    # TypeScript check + Vite build
npm run preview  # Preview production build
```

---

## Project Structure

```
nexus/
├── src/                    # Frontend (React + TypeScript)
│   ├── components/         # UI components (Library, GameDetail, Settings, Onboarding, etc.)
│   ├── lib/                # API bindings, stores, utilities
│   ├── routes/             # Routing
│   ├── test/               # Vitest setup
│   └── __tests__/          # Component and integration tests
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── commands/       # Tauri invoke handlers (games, sessions, metadata, sources, …)
│   │   ├── db/             # SQLite schema and migrations
│   │   ├── dedup/          # Duplicate detection
│   │   ├── metadata/       # IGDB, SteamGridDB, cache
│   │   ├── models/         # Shared data structures
│   │   └── sources/        # Steam, Epic, GOG, Xbox, Battle.net, Ubisoft, standalone, watcher
│   ├── Cargo.toml
│   └── tauri.conf.json     # App id, window config, bundle settings, CSP
├── package.json
├── vite.config.ts
└── index.html
```

---

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Vite dev server only |
| `npm run build` | `tsc` + `vite build` |
| `npm run tauri dev` | Full Tauri dev (frontend + backend) |
| `npm run tauri build` | Production build + installers |
| `npm run test` | Run Vitest once |
| `npm run test:watch` | Vitest watch mode |
| `npm run preview` | Preview Vite production build |

Rust tests:

```powershell
cd nexus/src-tauri; cargo test
```

---

## Configuration & Optional Services

- **IGDB** (Twitch) — For game metadata and ratings. Optional; set in Settings → API Keys.
- **SteamGridDB** — For custom grid artwork. Optional; set in Settings → API Keys.

Data (SQLite DB, cache, settings) is stored in the Tauri app data directory (e.g. `%APPDATA%\com.darrenstrydom.nexus` on Windows).

---

## Documentation

- **Design system** — UI follows the Nexus Design System (Obsidian theme). If you have the design doc (e.g. `docs/design/nexus-design-system.md` in a sibling or parent repo), it defines colors, typography, spacing, components, and accessibility.
- **Tauri** — [tauri.app](https://tauri.app) for Tauri v2 docs.

---

## Contributing

1. Run `npm run tauri dev` from `nexus/` and make changes with hot reload.
2. Run `npm run test` and `cargo test` in `nexus/src-tauri` before submitting.
3. Follow the Nexus design system for UI changes (dark-only, tokens, motion, accessibility).

---

## License & Copyright

Copyright © 2026 Darren Strydom. All rights reserved.

This project is not currently distributed under an open-source license. See repository or author for terms.
