// Shared schema + seed logic used by:
//   - api/_lib/db.js      (self-healing check on every serverless request)
//   - scripts/migrate.js  (manual/local table creation)
//   - scripts/seed.js     (manual/local seeding)
//
// Keeping this in one place means the live site and the manual scripts can
// never drift out of sync with each other.

'use strict';

// The property list that used to be hard-coded as `var PROPERTIES = [...]`
// in index.html. Loaded once, only if the properties table is empty.
const SEED_PROPERTIES = [
  'Hoy Center — Staunton',
  'Warehouse District — Staunton',
  '1854 E Market St — Harrisonburg',
  'Other / not listed',
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

// Arbitrary fixed key for a Postgres advisory lock. Scopes schema
// creation + seeding so that concurrent cold starts (or a script running
// at the same time as a live request) never race to seed twice.
const ADVISORY_LOCK_KEY = 872341501;

async function createTables(client) {
  await client.query(CREATE_PROPERTIES_TABLE);
  await client.query(CREATE_SUBMISSIONS_TABLE);
}

// Only ever seeds `properties`. `submissions` starts empty on purpose —
// there is no legitimate "seed" data for tenant requests, and an empty
// table is a completely normal, healthy state for it.
async function seedIfEmpty(client) {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM properties');
  if (rows[0].n > 0) {
    return { seeded: false };
  }
  for (let i = 0; i < SEED_PROPERTIES.length; i++) {
    await client.query(
      'INSERT INTO properties (name, sort_order) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
      [SEED_PROPERTIES[i], i]
    );
  }
  return { seeded: true, count: SEED_PROPERTIES.length };
}

// The one function the live site depends on: idempotent, safe to call on
// every request. Creates tables if missing, and seeds `properties` only
// if it is completely empty — real edits are never overwritten.
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
  ADVISORY_LOCK_KEY,
  createTables,
  seedIfEmpty,
  ensureSchemaAndSeed,
};
