---
name: discord-changelog
description: Generate a Discord-ready markdown changelog from git commits in the Nexus repo for a date range, then mirror the entry onto the website changelog page. Use when asked for a Discord changelog, release notes for Discord, community update post, or "what changed between dates".
---

# discord-changelog

Generate a **gorgeous, Discord-ready markdown changelog** from git commits in the Nexus app repo. The output is meant to be copied and pasted into a Discord channel.

## Scope

- **Repository:** All git commands run in the repo root (`D:\Development\game-launcher\game-launcher`). Use PowerShell for any terminal commands.
- **Domain:** `https://www.nexusgamelauncher.com` — all absolute URLs referencing the website must use this domain.
- **Commit format:** The project uses Conventional Commits (`type(scope): subject`). Use that to categorize and phrase entries.

## Step 1: Get the date range and version number

**Retrieve the version number from the repo.** Read the `version` field from:

- **File:** `nexus/package.json`

Use that value in the changelog with a `v` prefix (e.g. `0.1.6` -> `v0.1.6`). Do not ask the user for the version.

**Ask the user only for the date range** (unless they already provided it):

- **From date** (start of range) — e.g. `2025-03-01`
- **To date** (end of range, inclusive) — e.g. `2025-03-04`

If the user invokes the command without dates, prompt them:

> **Discord Changelog** — I need the date range for the changelog.
> - **From date** (YYYY-MM-DD):
> - **To date** (YYYY-MM-DD):

If they provide dates in the same message (e.g. "from 2025-03-01 to 2025-03-04"), use those and skip the prompt. Only prompt for the missing date(s) if one or both are not provided.

## Step 2: Fetch commits

From the repo root, run:

```powershell
git log --since="<FROM_DATE> 00:00:00" --until="<TO_DATE> 23:59:59" --pretty=format:"%h|%s|%b" --no-merges
```

Use the user's from/to dates. If the range is empty, say so and suggest a wider range; do not invent commits.

## Step 3: Build the changelog

1. **Parse each line** — split on `|` to get hash, subject, body. Treat subject as the main description; use body only for extra context.
2. **Categorize** by conventional type (and scope when useful):
   - `feat` -> **New / features**
   - `fix` -> **Fixes**
   - `perf` -> **Performance**
   - `refactor` / `chore` / `style` -> **Improvements / under the hood** (only include if user-facing or notable)
   - `docs` / `test` / `ci` -> Omit unless clearly worth mentioning to users (e.g. "Improved docs for X").
3. **Rewrite for users** — turn technical subject lines into short, clear bullets. No jargon, no "fix(scope):" in the final text. One line per change; optional second line only if the body adds real value.
4. **Deduplicate** — if several commits describe the same change, merge into one bullet.
5. **Order** — put "New / features" first, then "Fixes", then "Improvements / performance". Within each group, most recent or most impactful first.

## Step 4: Format for Discord

Output a **single markdown block** that looks great in Discord and is easy to paste:

- **Title:** One main heading with the app name, version number, and date range (e.g. `# Nexus v1.2.0 — Updates (Mar 1 - Mar 4, 2025)`).
- **Sections:** Use `##` for each category. Give each section a clear, short name and an emoji so it scans well (e.g. `## New`, `## Fixes`, `## Improvements`).
- **Bullets:** Use `-` with **bold** for the change topic and normal text for the detail (e.g. `- **Twitch panel** — Trending games in your library now load from cache.`).
- **Discord-safe markdown:** Use only what Discord supports: `#`/`##` headers, `**bold**`, `*italic*`, `` `code` ``, and lists. No raw HTML or fancy extensions.
- **Tone:** Friendly and concise. No "Fixed issue where..."; prefer "Fixed ..." or "... now works correctly."
- **Length — hard limit of 2000 characters (including the download link).** Discord's free tier enforces this limit. After drafting, count the total characters. If the draft exceeds 2000 characters, trim in this order until it fits:
  1. Cut bullets to the 5-8 most user-relevant changes; add a single line `- Plus smaller fixes and improvements.` to cover the rest.
  2. Shorten individual bullets — remove optional detail after the dash, keep only the bold topic and a brief phrase.
  3. Merge the "Improvements" section into a single bullet if it has more than two entries.
  4. As a last resort, drop the "Improvements" section entirely and fold any critical items into "Fixes".
- **Download link (required):** Always end the changelog with a line that tells users where to get the latest version. Use this URL: **https://www.nexusgamelauncher.com** — e.g. `Get the latest version: https://www.nexusgamelauncher.com`. This line counts toward the 2000-character limit.

End your response with the full changelog in a copyable markdown block and a short line: *You can copy the block above and paste it into your Discord channel.*

## Step 5: Update the Nexus website changelog

After generating the Discord changelog, **also update the website changelog page** at `nexus-website/changelog.html`.

### If `changelog.html` does not exist yet

Create it with the same HTML shell as `index.html` (same `<head>`, navbar, footer, Bootstrap/Lucide/Geist imports, and Obsidian theme CSS). The page body should contain:

- A page heading: `Changelog`
- A brief intro line (e.g. "Release notes for Nexus.")
- A changelog entries container where each release is rendered as a card/section.

### Adding the new release entry

1. **Build an HTML entry** from the same categorised data used for the Discord changelog. Each entry should include:
   - Version number and date range as a heading (e.g. `v0.1.7 — Mar 1 - Mar 4, 2025`).
   - Category sub-headings (`New`, `Fixes`, `Improvements`) with bulleted lists matching the Discord output.
   - Use the site's existing design-system classes (`type-*`, `text-muted-foreground`, `section-block`, etc.) so it matches the rest of the website.
2. **Prepend** the new entry at the top of the entries container so the most recent release always appears first.
3. **Do not remove or alter existing entries** — only add the new one above them.

### Styling guidelines

- Follow the Nexus Design System (`docs/design/nexus-design-system.md`) — dark theme only, design tokens, Geist fonts, spacing scale.
- Keep the page visually consistent with `index.html` (same navbar, footer, background, glass dividers).
- Each release entry should be clearly separated (e.g. a card, `<article>`, or `<section>` with a subtle border or divider).
- Use semantic HTML (`<article>`, `<h2>`/`<h3>`, `<ul>`) for accessibility.

## Example output shape

```markdown
# Nexus v1.2.0 — Updates (Mar 1 - Mar 4, 2025)

## New
- **Trending in your library** — Twitch trending games that you own now show in a dedicated section with cached data.

## Fixes
- **Twitch panel** — Corrected loading state when the Twitch API is slow or unavailable.
- **Game cards** — Live viewer count no longer flickers when refreshing.

## Improvements
- **Offline resilience** — Twitch data is cached so you can still see recent state when offline.

Get the latest version: https://www.nexusgamelauncher.com
```

*You can copy the block above and paste it into your Discord channel.*
