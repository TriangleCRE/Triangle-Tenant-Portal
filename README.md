# Triangle Tenant Portal

A tenant portal for submitting Work Orders, COI Submissions, HVAC Compliance
records, and other requests to property management. Static front end
(`index.html`) backed by `/api` serverless functions and Postgres.

## How data is stored

- **`properties`** — the list of properties shown in the request-form
  dropdowns. Simple, uniform data, so it's a normal typed-column table
  (`id`, `name`, `sort_order`).
- **`submissions`** — every submitted Work Order / COI / HVAC / Other
  request. Each type has a different, evolving set of fields, so instead
  of a wide, mostly-null column schema, the type-specific fields are
  stored as a single `data JSONB` column alongside `id`, `type`,
  `reference`, and timestamps.

## Self-healing setup

The live site does **not** depend on anyone running a migration by hand.
Every `/api` request calls `ensureReady()` (`api/_lib/db.js`) first, which:

1. Creates the `properties` and `submissions` tables if they don't exist
   (`CREATE TABLE IF NOT EXISTS`, idempotent).
2. Seeds `properties` with the original property list **only if the table
   is completely empty** — so a brand-new production database gets usable
   data on the very first request, and real edits are never overwritten.

A Postgres advisory lock guards this so concurrent cold starts can't race
each other into seeding twice.

## Manual scripts

For local development or one-off ops work, the same logic is available as
standalone scripts (the deployed site never needs these to be run):

```bash
npm install
cp .env.example .env   # set DATABASE_URL to your local/dev Postgres
npm run migrate         # create tables if missing
npm run seed            # seed `properties` if it's empty
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | Postgres connection string. Set automatically by Vercel's Neon Postgres storage integration in production. |
| `PORTAL_PASSWORD` | Passcode required by the login screen and every `/api` route. Defaults to `triangle` if unset. |

## API

All routes require the same passcode as the login screen, sent as either
an `X-Portal-Password` header or an `Authorization: Bearer <password>`
header.

- `GET /api/properties` — list properties
- `POST /api/properties` — create `{ name }`
- `PUT /api/properties/:id` — rename `{ name }`
- `DELETE /api/properties/:id` — remove

- `GET /api/submissions` — list all submitted requests
- `POST /api/submissions` — create `{ type, data }`
- `GET /api/submissions/:id` — fetch one
- `PUT /api/submissions/:id` — edit `{ data }`
- `DELETE /api/submissions/:id` — remove
