// Shared schema + seed logic used by:
//   - api/_lib/db.js      (self-healing check on every serverless request)
//   - scripts/migrate.js  (manual/local table creation)
//   - scripts/seed.js     (manual/local seeding)
//
// Keeping this in one place means the live site and the manual scripts can
// never drift out of sync with each other.

'use strict';

const bcrypt = require('bcryptjs');

// The property list that used to be hard-coded as `var PROPERTIES = [...]`
// in index.html. Loaded once, only if the properties table is empty.
const SEED_PROPERTIES = [
  'Hoy Center — Staunton',
  'Warehouse District — Staunton',
  '1854 E Market St — Harrisonburg',
  'Other / not listed',
];

// Three demo accounts, one per role, so the new login system can be
// exercised right away. Change these passwords (or delete the accounts)
// before this ever holds real tenant data.
const SEED_USERS = [
  {
    email: 'tenant@demo.trianglecre.com',
    password: 'TenantDemo123!',
    role: 'tenant',
    name: 'Jane Tenant',
    company: 'Blue Ridge Coffee Co.',
    property: 'Hoy Center — Staunton',
    unit: 'Suite C',
  },
  {
    email: 'staff@demo.trianglecre.com',
    password: 'StaffDemo123!',
    role: 'staff',
    name: 'Alex Rivera',
    company: null,
    property: null,
    unit: null,
  },
  {
    email: 'maintenance@demo.trianglecre.com',
    password: 'MaintDemo123!',
    role: 'maintenance',
    name: 'Sam Cooper',
    company: null,
    property: null,
    unit: null,
  },
];

const CREATE_PROPERTIES_TABLE = `
  CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Submitted requests (Work Order / COI / HVAC / Other) vary a lot in shape
// from type to type, and may grow new optional fields over time, so we
// store the type-specific fields as JSONB instead of a wide, mostly-null
// column schema.
const CREATE_SUBMISSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS submissions (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    reference TEXT UNIQUE,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Logins for the three roles the portal supports: tenants (submit their
// own requests, no wide column schema needed — these fields are uniform
// and small), Triangle staff (full back-office access), and maintenance
// (work-order queue only).
const CREATE_USERS_TABLE = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('tenant','staff','maintenance')),
    name TEXT NOT NULL,
    company TEXT,
    property TEXT,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

// Added after the fact for existing deployments — IF NOT EXISTS on both
// the table and the columns keeps this safe to run against a database
// that already has a `submissions` table from before logins existed.
const ALTER_SUBMISSIONS_FOR_USERS = `
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  ALTER TABLE submissions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';
`;

// Arbitrary fixed key for a Postgres advisory lock. Scopes schema
// creation + seeding so that concurrent cold starts (or a script running
// at the same time as a live request) never race to seed twice.
const ADVISORY_LOCK_KEY = 872341501;

async function createTables(client) {
  await client.query(CREATE_PROPERTIES_TABLE);
  await client.query(CREATE_SUBMISSIONS_TABLE);
  await client.query(CREATE_USERS_TABLE);
  await client.query(ALTER_SUBMISSIONS_FOR_USERS);
}

// Only ever seeds `properties` and `users`, and only the tables that are
// completely empty — real edits (including someone deleting a demo
// account) are never overwritten.
async function seedIfEmpty(client) {
  const result = { properties: { seeded: false }, users: { seeded: false } };

  const props = await client.query('SELECT count(*)::int AS n FROM properties');
  if (props.rows[0].n === 0) {
    for (let i = 0; i < SEED_PROPERTIES.length; i++) {
      await client.query(
        'INSERT INTO properties (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [SEED_PROPERTIES[i], i]
      );
    }
    result.properties = { seeded: true, count: SEED_PROPERTIES.length };
  }

  const users = await client.query('SELECT count(*)::int AS n FROM users');
  if (users.rows[0].n === 0) {
    for (const u of SEED_USERS) {
      const passwordHash = bcrypt.hashSync(u.password, 10);
      await client.query(
        `INSERT INTO users (email, password_hash, role, name, company, property, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO NOTHING`,
        [u.email, passwordHash, u.role, u.name, u.company, u.property, u.unit]
      );
    }
    result.users = { seeded: true, count: SEED_USERS.length };
  }

  return result;
}

// The one function the live site depends on: idempotent, safe to call on
// every request. Creates tables if missing, and seeds each table only if
// it is completely empty — real edits are never overwritten.
async function ensureSchemaAndSeed(pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
    try {
      await createTables(client);
      return await seedIfEmpty(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

module.exports = {
  SEED_PROPERTIES,
  SEED_USERS,
  ADVISORY_LOCK_KEY,
  createTables,
  seedIfEmpty,
  ensureSchemaAndSeed,
};
