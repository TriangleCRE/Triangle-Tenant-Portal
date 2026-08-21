// Postgres connection + self-healing schema/seed check, shared by every
// /api handler. Connection string comes ONLY from environment variables —
// never hard-code credentials here.

'use strict';

const { Pool } = require('pg');
const { ensureSchemaAndSeed } = require('../../db/schema');

function getConnectionString() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING;
  if (!connectionString) {
    throw new Error(
      'No Postgres connection string found. Set DATABASE_URL (or POSTGRES_URL) in the environment.'
    );
  }
  return connectionString;
}

let pool = null;
function getPool() {
  if (!pool) {
    const connectionString = getConnectionString();
    const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
    pool = new Pool({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

// Cached per warm serverless instance. On first request after a cold
// start (or the very first request ever, against a brand-new database)
// this creates the tables and seeds them before anything is served, so a
// fresh production database never looks like "all the data was deleted".
let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = ensureSchemaAndSeed(getPool()).catch((err) => {
      // Let the next request try again instead of staying broken forever.
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

module.exports = { getPool, ensureReady };
