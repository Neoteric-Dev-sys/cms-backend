import { Router } from 'express';
import User from '../models/User.js';
import { verifyPassword, signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../lib/auth.js';
import { resolvedPermissions } from '../lib/permissions.js';
import { asyncHandler } from '../lib/asyncHandler.js';

/* Minimal shape for the "who am I really" banner while impersonating —
   never the full user object (no permissions/overrides needed for a
   label + a revert button). */
async function realUserSummary(realUserId) {
  if (!realUserId) return null;
  const u = await User.findById(realUserId).select('name email role');
  return u ? { id: u._id.toString(), name: u.name, email: u.email, role: u.role } : null;
}

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  // console.log(email, password);

  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({
    user: {
      id: user._id.toString(), email: user.email, name: user.name, role: user.role,
      permissions: resolvedPermissions(user.role, user.permissionOverrides || {}),
    },
  });
}));

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    user: { ...req.user, permissions: resolvedPermissions(req.user.role, req.user.permissionOverrides) },
    realUser: await realUserSummary(req.user.realUserId),
  });
}));

/* Ends impersonation by re-signing a token for whoever started it, with
   no realUserId claim this time — see signToken()'s own comment. Not
   gated by the impersonate capability on purpose: whatever role you'd
   need to have gotten INTO an impersonated session in the first place,
   getting back OUT of it must never itself require a permission you
   might not hold while wearing someone else's account. */
router.post('/revert-impersonation', requireAuth, asyncHandler(async (req, res) => {
  if (!req.user.realUserId) return res.status(400).json({ error: 'Not currently impersonating anyone.' });

  const realUser = await User.findById(req.user.realUserId);
  if (!realUser || !realUser.active) return res.status(401).json({ error: 'Your original account is no longer available — please sign in again.' });

  const token = signToken(realUser);
  setAuthCookie(res, token);
  res.json({
    user: {
      id: realUser._id.toString(), email: realUser.email, name: realUser.name, role: realUser.role,
      permissions: resolvedPermissions(realUser.role, realUser.permissionOverrides || {}),
    },
  });
}));

export default router;
