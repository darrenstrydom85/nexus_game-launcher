# Security + dead code audit — 2026-09-27

Source: repo-wide audit of `nexus/` (frontend `src/`, backend `src-tauri/`) at v0.5.4.
Ordered by impact. Tick items off as they land; note the PR next to each.

Legend: **S** = security, **D** = dead code / simplification. Line counts are approximate.

---

## P0 — fix now

- [x] **S1 `launch_game` command injection** — `launch_direct_exe` / `launch_url` run `cmd /C start "" <target>`
  with `target` straight from the webview. Rust's BatBadBut escaping does not apply when the program is `cmd`
  itself, so unquoted `&`, `|`, `^`, `%VAR%` in an exe path or URL run extra commands. Also a live bug: Epic
  URLs (`...?action=launch&silent=true`) are split at `&` today.
  Fix: exe → `Command::new(exe).current_dir(parent)` with ShellExecute fallback (UAC, `.lnk`);
  URL → scheme allowlist per protocol + `tauri_plugin_opener::open_url`.
  `src-tauri/src/commands/launcher.rs`

## P1 — close attack surface

- [x] **S2 asset protocol scope is the whole disk** — `assetProtocol.scope: ["**/*"]` lets the webview read
  `twitch_key.bin`, `games.db`, anything. Narrow to the cover/metadata cache dir. Check whether user-picked
  custom covers are copied into the cache or loaded in place first. `src-tauri/tauri.conf.json:26`
- [x] **S3 `opener:allow-open-path` on `/**`** — webview can open/run any file. Frontend only reveals
  game folders + DB folder. Replace with a Rust command keyed by game id, drop the permission.
  `src-tauri/capabilities/default.json:16`, `src/App.tsx:520,788`, `src/components/Settings/DataManagement.tsx:179`
- [x] **S4 `export_stats_zip` arbitrary read + SSRF** — non-http `assets[].source` is `fs::read` of any path;
  http sources are fetched unrestricted. Allow only https from known cover CDNs or files under the cover cache.
  `src-tauri/src/commands/export.rs:53-69`
- [x] **S5 remove `tauri-plugin-shell`** — registered + `shell:allow-open` granted, never used on either side.
  Drop plugin init, Cargo dep, npm package, capability entry. `src-tauri/src/lib.rs:276`
- [x] **S6 tighten capabilities**
  - fs: keep `allow-read-text-file`, `allow-write-file`, `allow-write-text-file`; drop read-dir/read-file/mkdir/remove/rename/exists
    (static `$APPDATA/nexus/**` scope does not even match the real data dir).
  - `process:default` → `process:allow-restart` (only `relaunch()` is used).
  - http scope: 11 hosts → `howlongtobeat.com`, `cdn2.steamgriddb.com`, `images.igdb.com` (verify RetroCover hosts).
  - `opener:default` → `opener:allow-open-url` limited to the hosts actually opened (also in `popout.json`).
- [ ] **S7 delete dead IPC commands** — every registered command is callable from the webview. See D3 + D4.

## P2 — secrets and hardening

- [ ] **S8 Twitch client secret baked into binary** (`option_env!`). Move to a public client + PKCE, drop
  `NEXUS_TWITCH_CLIENT_SECRET`. Google installed-app secret is non-confidential by design — leave it.
  `src-tauri/src/commands/twitch.rs:33-35`
- [ ] **S9 token encryption key stored next to the ciphertext** — wrap the key with DPAPI (`CryptProtectData`)
  or use the `keyring` crate. `src-tauri/src/twitch/tokens.rs:19-41`, `src-tauri/src/gdrive/tokens.rs:20-23`
- [ ] **S10 `stop_game(pid)` kills any PID** — only allow PIDs recorded for the active session.
  `src-tauri/src/commands/launcher.rs:224`
- [ ] **S11 devtools in release** — gate the `devtools` feature behind a `diag` cargo feature.
- [ ] **S12 `additionalBrowserArgs`** disables SmartScreen + `BlockInsecurePrivateNetworkRequests` — remove unless proven needed.
- [ ] **S13 auth-failure logs print raw provider body** — log status + error code only.
  `src-tauri/src/twitch/auth.rs:285`, `src-tauri/src/gdrive/auth.rs:210`
- [ ] **S14 Google OAuth has no `state` param** — add, to match Twitch.
- [ ] **S15 `build.rs` forwards every `.env` key** — only forward `NEXUS_TWITCH_*` / `NEXUS_GOOGLE_*`; drop dead JSONBIN keys.
- [ ] **S16 CSP** — drop `connect-src http://localhost:* http://127.0.0.1:*` if the main window never fetches the embed server.

## P3 — dead code (biggest cut first)

- [ ] **D1 folder watcher never starts** — nothing calls `start_folder_watchers`, no listener for
  `watcher-game-detected`. Delete `sources/watcher.rs`, the 4 watcher commands + helpers in `commands/sources.rs`,
  `notify`, `notify-debouncer-mini`. **Product check first:** `settingsStore.autoScan` hints auto-scan was planned. (~700)
- [ ] **D2 dedup feature unwired** — nothing imports `components/dedup`. Delete it, `dedupStore`, wrappers in
  `lib/tauri.ts:300-332`, and the Rust dedup commands. (~500)
- [ ] **D3 dead Rust commands (never invoked)** — `debug_wrapped_sessions` (+`WrappedDiagnostics`),
  `get_twitch_live_streams`, `get_collections`, `get_collection_games`, `reorder_collections`, `search_games`,
  `get_game`, `delete_game`, `get_play_sessions`, `get_twitch_embed_base_url`. Drop `open_twitch_login` from
  `generate_handler!` only (still used internally). (~400)
- [ ] **D4 test-only frontend modules** — `stores/metadataStore.ts`, `lib/tracking.ts`,
  `hooks/useOrphanedSessionRecovery.ts`, `Collections/CollectionView.tsx`, `Collections/SortableCollectionList.tsx`,
  `Search/FilterBar.tsx`, `Search/SmartCollections.tsx`, `Twitch/TrendingInLibrary.tsx`, `shared/ErrorBoundary.tsx`,
  `components/motion/*`, `hooks/useAutoStatusTransition.ts`, `hooks/useKeyboardNav.ts`, `hooks/useOnlineStatus.ts`,
  `lib/retry.ts`, `ui/glass-panel.tsx` + their tests. Then re-check which Rust commands they alone called
  (list in audit: `ping`, `get_playtime`, `get_metadata`, `emit_test_event`, `get_placeholder_cover`, …). (~1.4k)
- [ ] **D5 zero-ref frontend** — `hooks/useWatchSession.ts`, `shared/DynamicBackground.tsx`,
  `shared/ManualTrackingToast.tsx`, `Library/LazyImage.tsx`, `assets/react.svg`, `assets/nexus-logo-32.png`,
  `assets/hardware/*.png`. (~260)
- [ ] **D6 `CommandError` boilerplate** — 448× `map_err(Database)` + 213× lock-poisoned `map_err`.
  `impl From<rusqlite::Error>` + `DbState::conn()` helper, use `?`. (~650)
- [ ] **D7 duplicated OAuth plumbing** — `gdrive/{auth,tokens}.rs` vs `twitch/{auth,tokens}.rs` near-identical.
  One `oauth` module parameterised by provider + key file. Do alongside S8/S9. (~300)
- [ ] **D8 `commands/tests.rs`** duplicates `error.rs` tests. (~280)
- [ ] **D9 `lib/tauri.ts`** — 1188 lines, half the app bypasses it with raw `invoke`. Pick one path; ~60 wrappers dead.
- [ ] **D10 unread store fields** — settingsStore (`autoScan`, `minimizeToTray`, `launchAtStartup`,
  `hiddenSmartCollections`, several setters), filterStore (`tagFilterMode` never set; `minRating`, `maxPlayTimeH`,
  `collectionId` only read by dead FilterBar), `achievementStore.newUnlockCount`, `toastStore.updateToast`,
  `masteryStore.getByGameId`. (~110)
- [ ] **D11 duplicate helpers** — hours formatter ×7, relative-time ×4, bytes ×3, URL normaliser ×4
  (use `lib/url.resolveUrl`), Rust `now_secs()` ×5, date helpers in `watch_history.rs` / `wrapped.rs`. (~150)
- [ ] **D12 clipboard via Rust** — `navigator.clipboard.write(ClipboardItem)` works in WebView2. Delete
  `commands/clipboard.rs`, `arboard`, `png`. (~57, −2 deps)
- [ ] **D13 small cuts** — hand-rolled base64 in `metadata/placeholders.rs` (use `base64` crate);
  `check_twitch_api_available` duplicates `connectivity::check_online`; `is_cached_online` unused;
  `HelixClipsResponse.pagination` unused; `ErrorKind` mirrors `CommandError`; `use-reduced-motion` re-export;
  `main.tsx` `Root()`; `standalone.rs` rebuilds 4 regexes per folder (`LazyLock`, or drop `regex-lite`);
  `image-ico` tauri feature → `image-png`.

## Checked and fine

No SQL injection (all `format!` SQL uses fixed lists or `?N`); no `innerHTML`/`dangerouslySetInnerHTML`;
`.env` never committed; updater signed + https; `*.log` ignored; `unsafe-headers` on http plugin is needed
(`hltb.ts` sets `Origin`/`Referer`); `src/retro` is a live feature; all 11 `@fontsource` packages used.

## Notes

- S2: custom cover/hero files outside the cache are re-granted at startup (image extensions only). A path
  typed into the Edit modal (not picked via Browse) shows after the next restart.
- S4: remote export sources are https-only but any host (custom covers). Host allowlist if SSRF ever matters.
- `retro-mode.test.tsx` "M opens metadata search…" is flaky under full-suite load; passes alone.
