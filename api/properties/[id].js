'use strict';

const { requireAuth } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

module.exports = async (req, res) => {
  const user = requireAuth(req, res, ['staff']);
  if (!user) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  try {
    await ensureReady();
    const pool = getPool();

    if (req.method === 'PUT') {
      const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      const { rows } = await pool.query(
        'UPDATE properties SET name = $1 WHERE id = $2 RETURNING id, name, sort_order, created_at',
        [name, id]
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const { rowCount } = await pool.query('DELETE FROM properties WHERE id = $1', [id]);
      if (!rowCount) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(204).end();
    }

    res.setHeader('Allow', 'PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'A property with that name already exists' });
    }
    console.error('properties API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
