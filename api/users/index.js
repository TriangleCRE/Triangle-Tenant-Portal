'use strict';

const { requireAuth, hashPassword, ROLES } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

const SAFE_COLUMNS = 'id, email, role, name, company, property, unit, created_at';

module.exports = async (req, res) => {
  // User accounts are Triangle-staff-only territory — tenants and
  // maintenance never see this endpoint.
  const user = requireAuth(req, res, ['staff']);
  if (!user) return;

  try {
    await ensureReady();
    const pool = getPool();

    if (req.method === 'GET') {
      const { rows } = await pool.query(`SELECT ${SAFE_COLUMNS} FROM users ORDER BY role ASC, name ASC`);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      const role = body.role;
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const company = typeof body.company === 'string' && body.company.trim() ? body.company.trim() : null;
      const property = typeof body.property === 'string' && body.property.trim() ? body.property.trim() : null;
      const unit = typeof body.unit === 'string' && body.unit.trim() ? body.unit.trim() : null;

      if (!email || !password || !name) {
        return res.status(400).json({ error: 'email, password, and name are required' });
      }
      if (!ROLES.includes(role)) {
        return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
      }
      if (password.length < 8) {
        return res.status(400).json({ error: 'password must be at least 8 characters' });
      }

      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash, role, name, company, property, unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${SAFE_COLUMNS}`,
        [email, hashPassword(password), role, name, company, property, unit]
      );
      return res.status(201).json(rows[0]);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    console.error('users API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
