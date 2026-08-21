# Triangle Tenant Portal

A tenant portal for submitting Work Orders, COI Submissions, HVAC Compliance
records, and other requests to property management. Static front end
(`index.html`) backed by `/api` serverless functions and Postgres.

## Logins and roles

Every user logs in with an email + password. There are three roles:

- **tenant** — submits Work Order / COI / HVAC / Other requests, and sees
  only their own submissions. Their profile (`company`, `property`,
  `unit`) pre-fills those fields on every form so they don't have to pick
  their property/unit each time — the fields stay editable in case a
  tenant ever needs to submit for a different unit.
- **staff** (Triangle back office) — sees and can edit/delete every
  submission, manages the `properties` list, and manages user accounts
  (create logins, reset passwords, delete accounts) under **Users**.
- **maintenance** — sees only Work Orders (not COI/HVAC/Other), and can
  only move a work order's `status` along (`open` → `in_progress` →
  `completed`); they can't edit the tenant's description or delete the
  request.

### Demo accounts

Seeded automatically the first time the `users` table is empty (see
`db/schema.js` → `SEED_USERS`) — change or delete these before this ever
holds real data:

| Role | Email | Password |
| --- | --- | --- |
| Tenant | `tenant@demo.trianglecre.com` | `TenantDemo123!` |
| Triangle Staff | `staff@demo.trianglecre.com` | `StaffDemo123!` |
| Maintenance | `maintenance@demo.trianglecre.com` | `MaintDemo123!` |

Staff can create real accounts (and remove these demo ones) from the
**Users** view once logged in.

### How sessions work

Logging in (`POST /api/auth/login`) verifies the password (bcrypt) and
sets a signed, httpOnly session cookie — there's no token for front-end
JS to hold, and refreshing the page keeps you logged in (`GET
/api/auth/me` checks the cookie on load). `POST /api/auth/logout` clears
it.

## How data is stored

- **`users`** — one row per login: `email`, `password_hash`, `role`
  (`tenant` / `staff` / `maintenance`), `name`, and for tenants `company`
  / `property` / `unit` (their form defaults). Uniform, small, and
  relational, so normal typed columns.
- **`properties`** — the list of properties shown in the request-form
  dropdowns. Also simple and uniform — normal typed columns (`id`,
  `name`, `sort_order`).
- **`submissions`** — every submitted Work Order / COI / HVAC / Other
  request. Each type has a different, evolving set of fields, so instead
  of a wide, mostly-null column schema, the type-specific fields are
  stored as a single `data JSONB` column alongside `id`, `type`,
  `reference`, `status`, `user_id` (owner), and timestamps.

## Self-healing setup

The live site does **not** depend on anyone running a migration by hand.
Every `/api` request calls `ensureReady()` (`api/_lib/db.js`) first, which:

1. Creates the `properties`, `submissions`, and `users` tables if they
   don't exist, and adds the `user_id`/`status` columns to `submissions`
   if they're missing (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT
   EXISTS` — safe to run against a database from before logins existed).
2. Seeds `properties` and `users` **only if each table is completely
   empty** — so a brand-new production database gets usable data (and
   working demo logins) on the very first request, and real edits/deleted
   demo accounts are never re-created.

A Postgres advisory lock guards this so concurrent cold starts can't race
each other into seeding twice.

## Manual scripts

For local development or one-off ops work, the same logic is available as
standalone scripts (the deployed site never needs these to be run):

```bash
npm install
cp .env.example .env   # set DATABASE_URL to your local/dev Postgres
npm run migrate         # create tables if missing
npm run seed            # seed `properties` and `users` if empty
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | Postgres connection string. Set automatically by Vercel's Neon Postgres storage integration in production. |
| `SESSION_SECRET` | Signs login session cookies. Defaults to a fixed dev value if unset — set a real random value in production (`openssl rand -base64 32`). |

## API

Every route below requires a logged-in session (the cookie set by
`POST /api/auth/login`), with additional role checks noted per route.

- `POST /api/auth/login` — `{ email, password }` → sets session cookie, returns `{ user }`
- `POST /api/auth/logout` — clears the session cookie
- `GET /api/auth/me` — returns the logged-in user, or 401

- `GET /api/properties` — any role
- `POST /api/properties` / `PUT /api/properties/:id` / `DELETE /api/properties/:id` — **staff only**

- `GET /api/submissions` — tenants see only their own; maintenance sees only `type=work`; staff see everything
- `POST /api/submissions` — tenant or staff; `{ type, data }`
- `PUT /api/submissions/:id` — tenant can edit their own `{ data }`; maintenance can only update `{ status }` on work orders; staff can update either, on anything
- `DELETE /api/submissions/:id` — tenant (their own) or staff; not maintenance

- `GET /api/users` / `POST /api/users` / `PUT /api/users/:id` / `DELETE /api/users/:id` — **staff only**; staff can't change their own role away from `staff` or delete their own account
