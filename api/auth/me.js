'use strict';

const { requireAuth } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = requireAuth(req, res);
  if (!session) return;

  try {
    await ensureReady();
    const pool = getPool();
    const { rows } = await pool.query(
      'SELECT id, email, role, name, company, property, unit FROM users WHERE id = $1',
      [session.sub]
    );
    if (!rows.length) {
      // The account behind this session was deleted after the cookie was issued.
      return res.status(401).json({ error: 'Not logged in' });
    }
    return res.status(200).json({ user: rows[0] });
  } catch (err) {
    console.error('me API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
