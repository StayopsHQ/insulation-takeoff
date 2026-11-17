---
name: Cloudflare deployment target
description: Account selection requirement for this app's Cloudflare Worker and D1.
---

Use the configured D1 database ID in `wrangler.toml` to verify the Cloudflare account before deploying. Never create a replacement database to resolve a mismatch.

**Why:** A connected Cloudflare identity or account name alone does not prove that it owns this app's intended database.

**How to apply:** Match the Wrangler D1 ID against the selected account's database list before deployment or migrations. If it does not match, stop and ask for the intended account. Do not run remote migrations or deploy without explicit approval. Adding a Worker secret in the dashboard deploys immediately; use Wrangler's versions secret workflow to stage it when deployment is not approved.

Verify the live `/api/health` response identifies the Insulation Takeoff API before embedding the Worker URL in a native build. A matching D1 binding and an enabled hostname are not sufficient.

**Why:** The intended Worker had the correct database binding but served a placeholder instead of the application's API.

**How to apply:** Require the expected application JSON health response before mobile asset sync; do not treat an HTTP 200 alone as success.
