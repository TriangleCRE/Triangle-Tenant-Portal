'use strict';

const { requireAuth, hashPassword, ROLES } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

const SAFE_COLUMNS = 'id, email, role, name, company, property, unit, created_at';

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
      const body = req.body || {};
      const sets = [];
      const params = [];

      if (typeof body.name === 'string' && body.name.trim()) {
        params.push(body.name.trim());
        sets.push(`name = $${params.length}`);
      }
      if (body.role !== undefined) {
        if (!ROLES.includes(body.role)) {
          return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
        }
        if (id === user.sub && body.role !== 'staff') {
          return res.status(400).json({ error: "You can't change your own role away from staff" });
        }
        params.push(body.role);
        sets.push(`role = $${params.length}`);
      }
      if (body.company !== undefined) {
        params.push(body.company ? String(body.company).trim() : null);
        sets.push(`company = $${params.length}`);
      }
      if (body.property !== undefined) {
        params.push(body.property ? String(body.property).trim() : null);
        sets.push(`property = $${params.length}`);
      }
      if (body.unit !== undefined) {
        params.push(body.unit ? String(body.unit).trim() : null);
        sets.push(`unit = $${params.length}`);
      }
      if (typeof body.password === 'string' && body.password) {
        if (body.password.length < 8) {
          return res.status(400).json({ error: 'password must be at least 8 characters' });
        }
        params.push(hashPassword(body.password));
        sets.push(`password_hash = $${params.length}`);
      }

      if (!sets.length) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      params.push(id);
      const { rows } = await pool.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING ${SAFE_COLUMNS}`,
        params
      );
      if (!rows.length) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      if (id === user.sub) {
        return res.status(400).json({ error: "You can't delete your own account" });
      }
      const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [id]);
      if (!rowCount) {
        return res.status(404).json({ error: 'not found' });
      }
      return res.status(204).end();
    }

    res.setHeader('Allow', 'PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'A user with that email already exists' });
    }
    console.error('users API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
