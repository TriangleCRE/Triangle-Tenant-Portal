// Shared passcode gate for the API. This mirrors the same passcode that
// guards the front end (index.html's login screen) — the two must never
// be checked in different places, or the API becomes a side door around
// the gate.

'use strict';

function getExpectedPassword() {
  return process.env.PORTAL_PASSWORD || 'triangle';
}

function getProvidedPassword(req) {
  const header = req.headers['x-portal-password'];
  if (header) return String(header);
  const auth = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(auth);
  return match ? match[1] : '';
}

function isAuthorized(req) {
  const provided = getProvidedPassword(req);
  return Boolean(provided) && provided === getExpectedPassword();
}

// Call at the top of every handler. Returns false (and has already sent
// a 401) when the request should stop; returns true when it's fine to
// keep going.
function requireAuth(req, res) {
  if (!isAuthorized(req)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

module.exports = { isAuthorized, requireAuth };
