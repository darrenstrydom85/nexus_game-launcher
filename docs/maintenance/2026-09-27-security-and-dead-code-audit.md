# Security + dead code audit — 2026-09-27

Source: repo-wide audit of `nexus/` (frontend `src/`, backend `src-tauri/`) at v0.5.4.
Ordered by impact. Tick items off as they land; note the PR next to each.

Legend: `[x]` done, `[~]` won't fix. **S** = security, **D** = dead code / simplification. Line counts are approximate.

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

- [~] **S8 Twitch client secret baked into binary** — WON'T FIX (risk accepted 2026-09-27): Twitch public clients are
  limited to the device-code flow; not worth the login UX change + forced re-link. Original note: (`option_env!`). Move to a public client + PKCE, drop
  `NEXUS_TWITCH_CLIENT_SECRET`. Google installed-app secret is non-confidential by design — leave it.
  `src-tauri/src/commands/twitch.rs:33-35`
- [x] **S9 token encryption key stored next to the ciphertext** — wrap the key with DPAPI (`CryptProtectData`)
  or use the `keyring` crate. `src-tauri/src/twitch/tokens.rs:19-41`, `src-tauri/src/gdrive/tokens.rs:20-23`
- [x] **S10 `stop_game(pid)` kills any PID** — only allow PIDs recorded for the active session.
  `src-tauri/src/commands/launcher.rs:224`
- [~] **S11 devtools in release** — WON'T FIX: deliberate for diagnosing packaged builds; a local user owns the machine anyway. Original note: — gate the `devtools` feature behind a `diag` cargo feature.
- [x] **S12 `additionalBrowserArgs`** — not an issue: `msWebOOUI,msPdfOOUI,msSmartScreenProtection` is Tauri's own default
  list (setting the field replaces it); `BlockInsecurePrivateNetworkRequests` is needed for the `localhost` Twitch embeds (af7f343).
- [x] **S13 auth-failure logs print raw provider body** — log status + error code only.
  `src-tauri/src/twitch/auth.rs:285`, `src-tauri/src/gdrive/auth.rs:210`
- [x] **S14 Google OAuth has no `state` param** — fixed for free by D7 (shared `oauth::authorize` sends and checks `state`).
- [x] **S15 `build.rs` forwards every `.env` key** — only forward `NEXUS_TWITCH_*` / `NEXUS_GOOGLE_*`; drop dead JSONBIN keys.
- [ ] **S16 CSP** — drop `connect-src http://localhost:* http://127.0.0.1:*` if the main window never fetches the embed server.
  Deferred: low value, and must be tested against Vite HMR in `tauri dev` first.

- [~] **S17 secrets reachable from the webview + in cloud backups** — WON'T FIX (risk accepted 2026-09-27): user's own keys,
  shown to them via the reveal toggle; backups keep them so restore works. Original note: — `igdb_client_secret`, `steamgrid_api_key`,
  `igdb_access_token` are plaintext in `settings`; the generic `get_setting`/`set_setting` IPC reads/writes any key
  (App.tsx:984-986 reads the secrets just to check they're set); cloud backup uploads the whole DB unscrubbed.
  Fix: deny-list secret/token keys in `get_setting`/`get_settings`/`set_setting` (use `get_key_status` for "is it set"),
  and blank token rows in the `VACUUM INTO` copy before upload.
- [x] **S18 stale build outputs held the JSONBIN keys** — deleted the 40 `target/*/build/Nexus-*` dirs (17 had the keys;
  `cargo clean -p Nexus` would have wiped 66 GiB). Still to do by hand: rotate/delete the JSONBIN keys if that service is dead.

## P3 — dead code (biggest cut first)

- [x] **D1 folder watcher never starts** — nothing calls `start_folder_watchers`, no listener for
  `watcher-game-detected`. Delete `sources/watcher.rs`, the 4 watcher commands + helpers in `commands/sources.rs`,
  `notify`, `notify-debouncer-mini`. **Product check first:** `settingsStore.autoScan` hints auto-scan was planned. (~700)
- [x] **D2 dedup feature unwired** — nothing imports `components/dedup`. Delete it, `dedupStore`, wrappers in
  `lib/tauri.ts:300-332`, and the Rust dedup commands. (~500)
- [x] **D3 dead Rust commands (never invoked)** — `debug_wrapped_sessions` (+`WrappedDiagnostics`),
  `get_twitch_live_streams`, `get_collections`, `get_collection_games`, `reorder_collections`, `search_games`,
  `get_game`, `delete_game`, `get_play_sessions`, `get_twitch_embed_base_url`. Drop `open_twitch_login` from
  `generate_handler!` only (still used internally). (~400)
- [x] **D4 test-only frontend modules** — `stores/metadataStore.ts`, `lib/tracking.ts`,
  `hooks/useOrphanedSessionRecovery.ts`, `Collections/CollectionView.tsx`, `Collections/SortableCollectionList.tsx`,
  `Search/FilterBar.tsx`, `Search/SmartCollections.tsx`, `Twitch/TrendingInLibrary.tsx`, `shared/ErrorBoundary.tsx`,
  `components/motion/*`, `hooks/useAutoStatusTransition.ts`, `hooks/useKeyboardNav.ts`, `hooks/useOnlineStatus.ts`,
  `lib/retry.ts`, `ui/glass-panel.tsx` + their tests. Then re-check which Rust commands they alone called
  (list in audit: `ping`, `get_playtime`, `get_metadata`, `emit_test_event`, `get_placeholder_cover`, …). (~1.4k)
- [x] **D5 zero-ref frontend** — `hooks/useWatchSession.ts`, `shared/DynamicBackground.tsx`,
  `shared/ManualTrackingToast.tsx`, `Library/LazyImage.tsx`, `assets/react.svg`, `assets/nexus-logo-32.png`,
  `assets/hardware/*.png`. (~260)
- [x] **D6 `CommandError` boilerplate** — 448× `map_err(Database)` + 213× lock-poisoned `map_err`.
  `impl From<rusqlite::Error>` + `DbState::conn()` helper, use `?`. (~650)
- [x] **D7 duplicated OAuth plumbing** — `gdrive/{auth,tokens}.rs` vs `twitch/{auth,tokens}.rs` near-identical.
  Token half done with S9 (`src/secrets.rs`); auth half in `src/oauth.rs` (1143 -> 787 lines).
  One `oauth` module parameterised by provider + key file. Do alongside S8/S9. (~300)
- [~] **D8 `commands/tests.rs`** — audit was wrong: its CommandError serialization tests cover kinds `error.rs` doesn't.
  Only the dead `ping`/stub tests were removed (with D3).
- [ ] **D9 `lib/tauri.ts`** — 1188 lines, half the app bypasses it with raw `invoke`. Pick one path; ~60 wrappers dead.
  Partly done with D3-D5: 25 dead wrappers + 14 orphaned types removed (now 883 lines). Raw-invoke vs wrapper choice remains.
- [x] **D10 unread store fields** — settingsStore (`autoScan`, `minimizeToTray`, `launchAtStartup`,
  `hiddenSmartCollections`, several setters), filterStore (`tagFilterMode` never set; `minRating`, `maxPlayTimeH`,
  `collectionId` only read by dead FilterBar), `achievementStore.newUnlockCount`, `toastStore.updateToast`,
  `masteryStore.getByGameId`. (~110)
- [x] **D11 duplicate helpers** — hours formatter ×7, relative-time ×4, bytes ×3, URL normaliser ×4
  (use `lib/url.resolveUrl`), Rust `now_secs()` ×5, date helpers in `watch_history.rs` / `wrapped.rs`. (~150)
- [ ] **D12 clipboard via Rust** — `navigator.clipboard.write(ClipboardItem)` works in WebView2. Delete
  `commands/clipboard.rs`, `arboard`, `png`. (~57, −2 deps)
- [x] **D13 small cuts** — hand-rolled base64 in `metadata/placeholders.rs` (use `base64` crate);
  `check_twitch_api_available` duplicates `connectivity::check_online`; `is_cached_online` unused;
  `HelixClipsResponse.pagination` unused; `ErrorKind` mirrors `CommandError`; `use-reduced-motion` re-export;
  `main.tsx` `Root()`; `standalone.rs` rebuilds 4 regexes per folder (`LazyLock`, or drop `regex-lite`);
  `image-ico` tauri feature → `image-png`.

## Unfinished features found (product decisions, not deleted)

- [ ] **U1 no Settings toggles** for achievement notifications, achievement sounds, milestone sounds. The stores read
  `achievementNotificationsEnabled` / `achievementSoundsEnabled` / `milestoneSoundsEnabled` and their setters persist,
  but no UI calls the setters, so users are stuck on the defaults. Add toggles, or drop the setters.
- [ ] **U2 `settingsStore.reducedMotion` is never set or loaded** (always `false`), yet `Sidebar` and `StreakSection`
  read it. Probably meant to follow the OS preference: switch them to `useReducedMotion()` from `motion/react`.
- [ ] **U3 unseen-achievements badge computed, never shown.** `achievementStore.newUnlockCount` + `last_achievement_view_at`
  cost a settings read per fetch and a write per view. Show the badge (sidebar nav?) or remove the chain.

## Checked and fine

No SQL injection (all `format!` SQL uses fixed lists or `?N`); no `innerHTML`/`dangerouslySetInnerHTML`;
`.env` never committed; updater signed + https; `*.log` ignored; `unsafe-headers` on http plugin is needed
(`hltb.ts` sets `Origin`/`Referer`); `src/retro` is a live feature; all 11 `@fontsource` packages used.

## Notes

- S2: custom cover/hero files outside the cache are re-granted at startup (image extensions only). A path
  typed into the Edit modal (not picked via Browse) shows after the next restart.
- S4: remote export sources are https-only but any host (custom covers). Host allowlist if SSRF ever matters.
- S9: keys wrapped with DPAPI (CurrentUser) in `src/secrets.rs`; raw 32-byte legacy key files are rewrapped on
  first load. A data folder restored on another machine/user can't unwrap them: re-link Twitch/Google there.
- D3-D5: 29 IPC commands removed in total (the 10 audited + 19 whose only callers were dead frontend code);
  `open_twitch_login` kept as a Rust fn (embed sign-in), just unregistered. Also dropped orphans: `aggregate_for_year`,
  `KeyAvailability`, `UnlockedAchievement`, `CollectionWithCount`.
- D7 found: `parse_token_error` checks `msg.contains("invalid")` case-sensitively, so Twitch's capitalised
  "Invalid refresh token" is classed `Api`, not `Auth`. Kept as-is in the refactor; check whether a revoked
  Twitch refresh token should force re-login (lowercase the msg before matching).
- D11: merged only byte-identical output. The 4 relative-time helpers were left alone: they print different
  text ("5 min ago" / "5m ago" / "Just now" / months / locale date after 7d), so merging changes the UI.
- D10: filterStore cut to tags + critic score (sources/statuses/genres/tagFilterMode/rating/playtime/collection were
  never set, so LibraryView's branches for them were dead; `ContinuePlayingRow.filterSources` was always `[]`).
  Kept `resetOnboarding`/`clearToasts`/`setCollections` (test resets / internal use).
- D13 kept on purpose: `hooks/use-reduced-motion` re-export is the `vi.mock` seam two test files use; the
  `image-ico` -> `image-png` feature swap skipped (tray icon works, swap only risks it).
- S10: done as a name guard (refuses Nexus's own pid + system-process blocklist). Sessions are tracked
  frontend-side, so Rust has no session pid list to check against.
- `retro-mode.test.tsx` "M opens metadata search…" is flaky under full-suite load; passes alone.
