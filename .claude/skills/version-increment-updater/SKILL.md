---
name: version-increment-updater
description: Full release-prep pipeline for the Nexus app with the in-app updater - build, test, bump version, update README + website, SIGNED production build, deploy installer artifacts, regenerate the updater manifest so existing installs auto-update. Use when asked to release, ship, publish, cut a version, or bump + deploy Nexus.
---

# version-increment-updater

Run a full release-prep pipeline for the Nexus app using the **in-app updater**
flow: build, test, bump version, update README and website, produce a **signed**
production build, deploy the installer, and publish the updater manifest so
existing installs auto-update.

> Successor to `version-increment`. Key differences: the production build is
> **signed** (so the Tauri updater trusts it), the NSIS `-setup.exe` + its
> `.sig` are the updater artifacts, and the website's `updates/latest.json`
> manifest is regenerated each release. The MSI is still produced and published
> for first-time/manual installs.

## Scope

All paths relative to the repo root (`D:\Development\game-launcher\game-launcher`). Use PowerShell for all commands.

- **App source:** `nexus/` (Tauri + React project).
- **Website:** `nexus-website/` (static HTML site).
- **Domain:** `https://www.nexusgamelauncher.com` — all absolute URLs in the website HTML must use this domain.
- **Releases folder:** `nexus-website/releases/` (created if it doesn't exist).
- **Updater manifest:** `nexus-website/updates/latest.json`.
- **Signing key (private, outside the repo):** `D:\Development\game-launcher\.secrets\nexus_updater.key`.
  - The matching public key is already embedded in `tauri.conf.json` under `plugins.updater.pubkey`.
  - The key **has a password**, stored at `D:\Development\game-launcher\.secrets\nexus_updater_password.txt`.
  - IMPORTANT: this Tauri CLI version **hangs forever** when signing with a *passwordless* key, and the build's signer reads `TAURI_SIGNING_PRIVATE_KEY` (the key **string/contents**), **not** `TAURI_SIGNING_PRIVATE_KEY_PATH`. Always pass the key contents + password via the two env vars in step 6.

## Steps (in order)

### 1. Build the project

From `nexus/`:

- Run `npm run build` (TypeScript check + Vite build). If it fails, stop and report.

### 2. Run all tests

- **Frontend:** From `nexus/`, run `npm run test` (Vitest). If any test fails, stop and report.
- **Rust:** From `nexus/src-tauri/`, run `cargo test`. If any test fails, stop and report.

Do not proceed to version bump or production build if either step fails.

### 3. Increment the version number

- **Scheme:** Semantic versioning; bump the **patch** segment (e.g. `0.4.2` -> `0.4.3`). If the user specifies "minor" or "major" in the chat, use that instead.
- Store the new version as `$VERSION` (e.g. `0.4.3`). Used for file naming, link updates, and the updater manifest.
- **Files to update** (keep all in sync with the same new version):
  - `nexus/package.json` — `"version"` field
  - `nexus/src-tauri/Cargo.toml` — `version` in `[package]`
  - `nexus/src-tauri/tauri.conf.json` — `"version"` field

> The version in `tauri.conf.json` becomes the running app's version AND must
> match the `version` written to `updates/latest.json` in step 8. It must be
> **strictly greater** than what users currently have or the update won't trigger.

### 4. Update README.md if needed

- Open `README.md` (repo root).
- If it contains a version badge or line (e.g. **v0.4.2**), replace it with the new version.
- If there is no version string in the README, skip this step.

### 5. Update the Nexus website (HTML)

Update all version references in `nexus-website/` so the public site reflects the new release.

#### 5a. Download links (all HTML files)

Scan **all `.html` files** in `nexus-website/` for download links and update them to point to the new MSI release (the MSI remains the manual/first-time download on the site).

| Find | Replace with |
|---|---|
| Any `href` pointing to a previous `releases/*.msi` path (or any stale download URL) | `releases/Nexus_${VERSION}_x64_en-US.msi` |

Apply this to every occurrence in:

- `nexus-website/index.html`
- `nexus-website/changelog.html`
- Any other `.html` files in `nexus-website/`

#### 5b. Version badge (`index.html`)

Update the version badge text inside the `.version-badge` span (in the Download CTA section) to show the current version:

| Find | Replace with |
|---|---|
| `v<OLD_VERSION> — Beta Access` (or whatever version string is there) | `v${VERSION} — Beta Access` |

#### 5c. Changelog (`changelog.html`)

- **Demote the current "Latest" entry** — on the existing latest `<article>`, remove the `changelog-entry--latest` class and remove the `<span class="version-badge ...">Latest</span>` badge element.
- **Add a new entry at the top** of the `.changelog-timeline` div for the new version. Use the same HTML structure as existing entries:
  - `<article class="changelog-entry changelog-entry--latest" id="v${VERSION}">`
  - Include the "Latest" badge span.
  - Set the `<time>` element to today's date.
  - For the entry body, write a short summary and list the changes from the current release. If the user provides release notes or a changelog in the chat, use those. Otherwise derive them from the git log since the previous release tag/version commit.
- **Capture these release notes** — the short summary is reused as the `notes` field in the updater manifest (step 8).

### 6. Signed production build

The build must be signed so the updater plugin will accept the artifact. Set the
signing env vars in the **same shell** that runs the build. Use the key
**contents** (`TAURI_SIGNING_PRIVATE_KEY`), not the path — the build's signer
ignores `TAURI_SIGNING_PRIVATE_KEY_PATH`. Also clear any stale `_PATH` var, since
setting both the key string and a path at once is rejected.

From `nexus/`:

```powershell
Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PATH -ErrorAction SilentlyContinue
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "D:\Development\game-launcher\.secrets\nexus_updater.key" -Raw).Trim()
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = (Get-Content "D:\Development\game-launcher\.secrets\nexus_updater_password.txt" -Raw).Trim()
npm run tauri build
```

- If the build fails, stop and report the error. Do not proceed.
- The build should end with `Finished 2 updater signatures at: ...`, producing a
  `.sig` next to both the `-setup.exe` and the `.msi`.
- If the build **hangs** at the signing step (after `Finished 2 bundles`), the
  password env var is missing/empty or the key is passwordless — stop, fix the
  env vars, and re-run. Never ship an unsigned build for the updater.
- If the build reports `incorrect updater private key password`, the password in
  `nexus_updater_password.txt` does not match the key — stop and report.

### 7. Locate and copy artifacts to the website releases folder

After a successful signed build there are three artifacts:

```
# MSI (manual / first-time install — referenced by the website download links)
nexus/src-tauri/target/release/bundle/msi/Nexus_${VERSION}_x64_en-US.msi

# NSIS installer (the updater artifact users auto-download)
nexus/src-tauri/target/release/bundle/nsis/Nexus_${VERSION}_x64-setup.exe

# Signature for the NSIS installer (its contents go into latest.json)
nexus/src-tauri/target/release/bundle/nsis/Nexus_${VERSION}_x64-setup.exe.sig
```

Verify the MSI and the NSIS `-setup.exe` exist. If a filename differs, check the
`bundle/msi/` and `bundle/nsis/` directories and use the actual files. If either
the MSI or the `-setup.exe` (or its `.sig`) is missing, stop and report — do not
modify the website or the manifest.

Copy the MSI and the NSIS installer into the releases folder:

```powershell
New-Item -ItemType Directory -Force -Path "nexus-website/releases"
Copy-Item "nexus/src-tauri/target/release/bundle/msi/Nexus_${VERSION}_x64_en-US.msi" "nexus-website/releases/"
Copy-Item "nexus/src-tauri/target/release/bundle/nsis/Nexus_${VERSION}_x64-setup.exe" "nexus-website/releases/"
```

- Verify the MSI filename matches the download links updated in step 5a.
- Verify the `-setup.exe` filename matches the `url` written to the manifest in step 8.

### 8. Regenerate the updater manifest (`updates/latest.json`)

Read the **contents** of the signature file and write the manifest so existing
installs detect, download, and verify the update.

```powershell
$sig = Get-Content "nexus/src-tauri/target/release/bundle/nsis/Nexus_${VERSION}_x64-setup.exe.sig" -Raw
$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
```

Then write `nexus-website/updates/latest.json` with this exact shape:

```json
{
  "version": "${VERSION}",
  "notes": "<short release summary from step 5c, or a changelog URL>",
  "pub_date": "<UTC RFC3339 timestamp, e.g. 2026-06-18T12:00:00Z>",
  "platforms": {
    "windows-x86_64": {
      "signature": "<full contents of Nexus_${VERSION}_x64-setup.exe.sig>",
      "url": "https://www.nexusgamelauncher.com/releases/Nexus_${VERSION}_x64-setup.exe"
    }
  }
}
```

- `version` must equal the `tauri.conf.json` version from step 3.
- `signature` is the **entire** content of the `.sig` file (a base64-ish blob), not a path.
- `url` must point at the `-setup.exe` copied in step 7 (NOT the MSI).
- Validate the file is well-formed JSON before finishing.

### 9. Report

Print a summary:

- Version bumped (old -> new)
- MSI filename and size; NSIS `-setup.exe` filename and size
- Full paths of the copied artifacts in the releases folder
- Confirmation the build was **signed** (and the `.sig` was found)
- `updates/latest.json` updated: version, pub_date, and that the signature + url were written
- Number of download links updated and which HTML files were changed
- Whether a new changelog entry was added
- Reminder: deploy the website so `releases/` and `updates/latest.json` go live; existing users update on their next launch.

## Fail fast

If build or any test fails, do not change version, update the website, or run
the production build. If the production build is unsigned, or the MSI / NSIS
`-setup.exe` / `.sig` are missing afterwards, do not modify the website or the
manifest.
