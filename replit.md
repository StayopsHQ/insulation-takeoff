# insulation

The imported insulation takeoff application, with its browser app and Cloudflare Worker source.

## Import scope

- The original source is in `artifacts/insulation/`, including the browser app, Worker, D1 migrations, tests, and Wrangler configuration.
- Keep the imported takeoff behavior intact. Treat the ZIP as the source of truth; do not replace it with a newly invented application.
- The Replit preview runs the imported browser app and Worker against local D1. Its migrations are applied in local mode; this does not contact Cloudflare or modify remote data.
- Set the Replit secret `INSULATION_LOCAL_SETUP_TOKEN` to enable creation of the first local administrator. The local launcher passes it to Wrangler via a short-lived temporary file outside the project.
- The browser-only Vite command is `pnpm --filter @workspace/insulation run dev:vite`; it does not serve `/api`.
- Never run a remote D1 migration or deploy to Cloudflare without the user's explicit request and confirmation of the target resources.
- Do not import secrets or generated dependency/build folders with future source updates.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
