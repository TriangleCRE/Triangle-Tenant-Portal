#!/usr/bin/env node
// Manual/local table creation. The live site does NOT depend on this
// being run — api/_lib/db.js performs the same check on first request —
// but it's here for local development and one-off ops use.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/migrate.js

'use strict';

try {
  require('dotenv').config();
} catch (_) {
  // dotenv is optional; env vars may already be set in the shell.
}

const { Pool } = require('pg');
const { createTables } = require('../db/schema');

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
    await createTables(client);
    console.log('Migration complete: "properties" and "submissions" tables are present.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
