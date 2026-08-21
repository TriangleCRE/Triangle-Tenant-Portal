'use strict';

const { ensureReady, getPool } = require('../_lib/db');
const { verifyPassword, createSessionToken, setSessionCookie } = require('../_lib/auth');

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    name: row.name,
    company: row.company,
    property: row.property,
    unit: row.unit,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    await ensureReady();
    const pool = getPool();
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase().trim()]);
    const row = rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: 'Incorrect email or password' });
    }
    const token = createSessionToken(row);
    setSessionCookie(req, res, token);
    return res.status(200).json({ user: publicUser(row) });
  } catch (err) {
    console.error('login API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
