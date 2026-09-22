/* Generic audit trail for every state-changing request the API handles.
   Mounted once per resource router (see index.js) instead of being
   hand-called from each of the ~40 POST/PUT/PATCH/DELETE routes spread
   across customers.js, users.js, roles.js, settings.js and events.js —
   so a new mutating route is audited automatically the day it's added,
   with no separate step anyone can forget. */
import AuditLog from '../models/AuditLog.js';

const SENSITIVE_KEYS = new Set(['password', 'passwordHash', 'newPassword', 'currentPassword', 'confirmPassword', 'token']);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEYS.has(key) ? '[redacted]' : sanitize(v);
    }
    return out;
  }
  return value;
}

/* Fire-and-forget on purpose — a write to the audit collection must
   never slow down, or fail, the request it's describing. */
function recordAudit(entry) {
  AuditLog.create(entry).catch((err) => console.error('Audit log write failed:', err.message));
}

/* `resource` is the fixed label for whichever router this is mounted
   on ('customers', 'users', ...), since req.baseUrl already gives that
   away redundantly — this just keeps it as its own filterable field
   instead of something the viewer has to parse back out of a path.

   Reads req.user, so on /api/auth it must be mounted AFTER requireAuth
   has run for the routes that carry it (revert-impersonation) — but
   works just as well when req.user is never set (login, logout), where
   the actor is recorded as null and whatever was sent (e.g. the
   attempted email, still present in the sanitized body) is the only
   trail of who it was. */
export function auditRoute(resource) {
  return (req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') return next();

    res.on('finish', () => {
      recordAudit({
        at: new Date(),
        resource,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        params: req.params,
        body: sanitize(req.body || {}),
        statusCode: res.statusCode,
        ok: res.statusCode < 400,
        actor: req.user
          ? { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }
          : null,
        ip: req.ip,
      });
    });

    next();
  };
}
