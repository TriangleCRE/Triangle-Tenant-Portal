'use strict';

const { requireAuth } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

module.exports = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  try {
    await ensureReady();
    const pool = getPool();

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'SELECT id, type, reference, data, created_at, updated_at FROM submissions WHERE id = $1',
        [id]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'PUT') {
      const { data } = req.body || {};
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return res.status(400).json({ error: 'data is required' });
      }
      const { rows } = await pool.query(
        `UPDATE submissions SET data = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, type, reference, data, created_at, updated_at`,
        [JSON.stringify(data), id]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { rowCount } = await pool.query('DELETE FROM submissions WHERE id = $1', [id]);
      if (!rowCount) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('submissions API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
