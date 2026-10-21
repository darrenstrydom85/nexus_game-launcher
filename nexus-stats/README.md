# nexus-stats

The anonymous counter behind Nexus's "Count me as a user" setting. `src/index.js` is the whole server, `src/dashboard.js` renders the public page at `/`, and `schema.sql` is the whole database. `/raw` returns every stored row as JSON. The app side is `nexus/src/lib/usageCount.ts`.

## Deploy

Do this once, after `nexusgamelauncher.com`'s DNS is on Cloudflare.

1. `npx wrangler login`
2. `npx wrangler d1 create nexus-stats`, then paste the printed `database_id` into `wrangler.toml`.
3. `npx wrangler d1 execute nexus-stats --remote --file=schema.sql`
4. `npx wrangler deploy`. This creates `stats.nexusgamelauncher.com` and its certificate.
5. Check that `curl -s https://stats.nexusgamelauncher.com/raw` returns `[]`.

To update after a change, run `npx wrangler deploy` again.

Optional: a Cloudflare rate-limiting rule on `stats.nexusgamelauncher.com` (for example, 10 requests per 10 seconds per IP) stops anyone inflating the counts.

## Test

`npm test`
