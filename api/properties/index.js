'use strict';

const { requireAuth } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

module.exports = async (req, res) => {
  // Any logged-in role can read the list (it feeds the request-form
  // dropdowns); only Triangle staff can add to it.
  const user = requireAuth(req, res, req.method === 'GET' ? undefined : ['staff']);
  if (!user) return;

  try {
    await ensureReady();
    const pool = getPool();

    if (req.method === 'GET') {
      const { rows } = await pool.query(
        'SELECT id, name, sort_order, created_at FROM properties ORDER BY sort_order ASC, id ASC'
      );
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const name = req.body && typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }
      const { rows } = await pool.query(
        `INSERT INTO properties (name, sort_order)
         VALUES ($1, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM properties))
         RETURNING id, name, sort_order, created_at`,
        [name]
      );
      return res.status(201).json(rows[0]);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'A property with that name already exists' });
    }
    console.error('properties API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
