'use strict';

const { requireAuth } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

// Mirrors the `title` of each entry in the front end's FORMS object —
// used to build the same-looking reference codes ("WOR-000123") the
// prototype used to fake with Math.random(). Kept server-side so a
// reference code can never be spoofed by the client.
const TYPE_PREFIXES = {
  work: 'WOR',
  coi: 'COI',
  hvac: 'HVA',
  other: 'OTH',
};

module.exports = async (req, res) => {
  // Tenants only ever see/create their own requests. Maintenance only
  // deals in work orders. Staff see and can create everything.
  const user = requireAuth(req, res, req.method === 'POST' ? ['tenant', 'staff'] : undefined);
  if (!user) return;

  try {
    await ensureReady();
    const pool = getPool();

    if (req.method === 'GET') {
      let query = 'SELECT id, type, reference, data, status, user_id, created_at, updated_at FROM submissions';
      const params = [];
      if (user.role === 'tenant') {
        params.push(user.sub);
        query += ` WHERE user_id = $${params.length}`;
      } else if (user.role === 'maintenance') {
        params.push('work');
        query += ` WHERE type = $${params.length}`;
      }
      query += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(query, params);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { type, data } = req.body || {};
      const prefix = TYPE_PREFIXES[type];
      if (!prefix) {
        return res.status(400).json({ error: 'invalid type' });
      }
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({ error: 'data is required' });
      }
      const ownerId = user.role === 'tenant' ? user.sub : null;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const inserted = await client.query(
          'INSERT INTO submissions (type, data, user_id) VALUES ($1, $2, $3) RETURNING id',
          [type, JSON.stringify(data), ownerId]
        );
        const id = inserted.rows[0].id;
        const reference = `${prefix}-${String(id).padStart(6, '0')}`;
        const { rows } = await client.query(
          `UPDATE submissions SET reference = $1 WHERE id = $2
           RETURNING id, type, reference, data, status, user_id, created_at, updated_at`,
          [reference, id]
        );
        await client.query('COMMIT');
        return res.status(201).json(rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('submissions API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
