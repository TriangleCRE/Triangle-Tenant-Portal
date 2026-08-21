'use strict';

const { requireAuth } = require('../_lib/auth');
const { ensureReady, getPool } = require('../_lib/db');

const VALID_STATUSES = ['open', 'in_progress', 'completed'];

module.exports = async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  const id = Number(req.query.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  try {
    await ensureReady();
    const pool = getPool();

    const existing = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'not found' });
    }
    const submission = existing.rows[0];

    // Same access rules as the list endpoint: tenants only touch their
    // own requests, maintenance only touches work orders.
    if (user.role === 'tenant' && submission.user_id !== user.sub) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    if (user.role === 'maintenance' && submission.type !== 'work') {
      return res.status(403).json({ error: 'Not allowed' });
    }

    if (req.method === 'GET') {
      return res.status(200).json(submission);
    }

    if (req.method === 'PUT') {
      const { data, status } = req.body || {};

      if (user.role === 'maintenance') {
        // Maintenance can move a work order's status along, but can't
        // rewrite what the tenant reported.
        if (data !== undefined) {
          return res.status(403).json({ error: 'Maintenance can only update status' });
        }
      }
      if (status !== undefined && !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
        return res.status(400).json({ error: 'data must be an object' });
      }
      if (data === undefined && status === undefined) {
        return res.status(400).json({ error: 'Nothing to update' });
      }

      const nextData = data !== undefined ? JSON.stringify(data) : JSON.stringify(submission.data);
      const nextStatus = status !== undefined ? status : submission.status;
      const { rows } = await pool.query(
        `UPDATE submissions SET data = $1, status = $2, updated_at = now()
         WHERE id = $3
         RETURNING id, type, reference, data, status, user_id, created_at, updated_at`,
        [nextData, nextStatus, id]
      );
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      if (user.role === 'maintenance') {
        return res.status(403).json({ error: 'Not allowed' });
      }
      await pool.query('DELETE FROM submissions WHERE id = $1', [id]);
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('submissions API error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
