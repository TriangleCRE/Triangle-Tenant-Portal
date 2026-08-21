// Per-user login (email + password) with three roles: tenant, staff
// (Triangle back-office), and maintenance. Sessions are a small signed
// token (HMAC-SHA256, no external JWT library needed) carried in an
// httpOnly cookie so front-end JS never has to hold a password or a
// forgeable token in localStorage.

'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const COOKIE_NAME = 'portal_session';
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

const ROLES = ['tenant', 'staff', 'maintenance'];

function getSessionSecret() {
  // Same pattern as the old shared passcode: works out of the box for
  // this low-stakes prototype, but should be overridden in production.
  return process.env.SESSION_SECRET || 'triangle-portal-dev-secret-change-me';
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(payloadB64) {
  return crypto.createHmac('sha256', getSessionSecret()).update(payloadB64).digest('base64url');
}

// payload should only ever hold what's needed to authorize a request —
// id/email/role/name. Full profile (property/unit/company) is fetched
// separately via GET /api/auth/me so a stale cookie can't carry stale data.
function createSessionToken(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const payloadB64 = base64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const [payloadB64, signature] = token.split('.');
  let expected;
  try {
    expected = sign(payloadB64);
  } catch (e) {
    return null;
  }
  const a = Buffer.from(signature || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(base64urlDecode(payloadB64));
  } catch (e) {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https';
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
  ];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Returns {sub, email, role, name} for a valid session, or null.
function getSessionUser(req) {
  const cookies = parseCookies(req);
  return verifySessionToken(cookies[COOKIE_NAME]);
}

// Call at the top of any handler that needs a logged-in user. Pass
// `allowedRoles` (array) to also restrict by role. On failure this has
// already sent the 401/403 response; the caller should just `return`.
function requireAuth(req, res, allowedRoles) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Not logged in' });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    res.status(403).json({ error: 'Not allowed for this role' });
    return null;
  }
  return user;
}

module.exports = {
  ROLES,
  COOKIE_NAME,
  hashPassword: (password) => bcrypt.hashSync(password, 10),
  verifyPassword: (password, hash) => bcrypt.compareSync(password, hash),
  createSessionToken,
  verifySessionToken,
  getSessionUser,
  requireAuth,
  setSessionCookie,
  clearSessionCookie,
};
