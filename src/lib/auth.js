import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { hasPermission } from './permissions.js';
import { asyncHandler } from './asyncHandler.js';

const COOKIE_NAME = 'token';
const TOKEN_TTL = '8h';

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return s;
}

export function signToken(user) {
  return jwt.sign(
    { id: user.id ?? user._id?.toString(), email: user.email, name: user.name, role: user.role },
    secret(),
    { expiresIn: TOKEN_TTL }
  );
}

/* In production the frontend and backend live on different domains
   (cross-site, e.g. a Vercel app calling an onrender.com API) — a
   cross-site cookie is only ever sent by the browser when it's marked
   SameSite=None, and browsers require Secure (HTTPS-only) on any
   SameSite=None cookie. Locally, frontend and backend are both on
   localhost (same-site), where SameSite=None actually gets rejected by
   some browsers unless also Secure — but plain HTTP localhost isn't
   Secure, so dev needs the Lax/insecure pair instead. Same options must
   be reused for both setting and clearing the cookie, or the browser
   won't recognize clearCookie's call as targeting the same cookie. */
const isProd = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  sameSite: isProd ? 'none' : 'lax',
  secure: isProd,
};

export function setAuthCookie(res, token) {
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: 8 * 60 * 60 * 1000 });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions);
}

/* attaches req.user = { id, email, name, role, permissionOverrides }
   from the httpOnly cookie, or 401s. Every /api/customers, /api/
   projects and /api/users route sits behind this — see backend/src/
   index.js. Looks the user up fresh on every request (not just off the
   JWT payload) so a deactivated account or a changed permission
   override takes effect immediately, not only after the 8h token
   expires and the person logs in again. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Not signed in' });

  let payload;
  try {
    payload = jwt.verify(token, secret());
  } catch {
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }

  const user = await User.findById(payload.id);
  if (!user || !user.active) return res.status(401).json({ error: 'Session expired — please sign in again' });

  req.user = {
    id: user._id.toString(), email: user.email, name: user.name, role: user.role,
    permissionOverrides: user.permissionOverrides || {},
  };
  next();
});

/* 403s unless req.user's role (or their personal override) has at
   least some access (not 'N') to the named PERMS capability row. Must
   run after requireAuth. */
export function requirePermission(capabilityLabel) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in' });
    if (!hasPermission(req.user.role, capabilityLabel, req.user.permissionOverrides)) {
      return res.status(403).json({ error: `Your role (${req.user.role}) does not have access to: ${capabilityLabel}` });
    }
    next();
  };
}
