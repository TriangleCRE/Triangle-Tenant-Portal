#!/usr/bin/env node
// Manual/local seeding. The live site does NOT depend on this being run
// — api/_lib/db.js seeds automatically on first request against an empty
// database — but it's here for local development and one-off ops use.
//
// Only ever inserts into `properties` and `users`, and only into
// whichever of those is completely empty, so it can never overwrite
// real data.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/seed.js

'use strict';

try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional; env vars may already be set in the shell.
}

const { Pool } = require('pg');
const { createTables, seedIfEmpty } = require('../db/schema');

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) {
    console.error('Set DATABASE_URL (or POSTGRES_URL) before running this script.');
    process.exit(1);
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await createTables(client); // make sure tables exist before seeding
    const result = await seedIfEmpty(client);
    if (result.properties.seeded) {
      console.log(`Seeded ${result.properties.count} properties.`);
    } else {
      console.log('"properties" already has data — left untouched.');
    }
    if (result.users.seeded) {
      console.log(`Seeded ${result.users.count} demo users (see db/schema.js SEED_USERS for credentials).`);
    } else {
      console.log('"users" already has data — left untouched.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
