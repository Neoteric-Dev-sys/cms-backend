import { Router } from 'express';
import User from '../models/User.js';
import { hashPassword, signToken, setAuthCookie, requirePermission } from '../lib/auth.js';
import { resolvedPermissions } from '../lib/permissions.js';
import { validateUserCreate, validateUserPatch, validateUserPermissions, validatePasswordReset } from '../lib/validateUsers.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const users = await User.find().sort({ role: 1, name: 1 });
  res.json(users);
}));

router.post('/', asyncHandler(async (req, res) => {
  const { errors, data } = validateUserCreate(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const user = await User.create({
      name: data.name, email: data.email, role: data.role,
      passwordHash: await hashPassword(data.password), active: true,
    });
    res.status(201).json(user);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ errors: { email: 'A user with this email already exists.' } });
    throw err;
  }
}));

router.patch('/:id', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  /* never let the acting user lock themselves out — no self-demotion
     away from a role that can still manage users, no self-deactivation */
  const isSelf = req.params.id === req.user.id;
  if (isSelf && req.body?.active === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }
  if (isSelf && req.body?.role !== undefined && req.body.role !== user.role) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }

  const { errors, data } = validateUserPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  Object.assign(user, data);
  await user.save();
  res.json(user);
}));

/* per-user exceptions to the role's PERMS row — see permissionOverrides
   in models/User.js and hasPermission in lib/permissions.js. A value of
   `null` for a label clears that override (reverts to the role
   default) rather than setting anything. */
router.patch('/:id/permissions', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { errors, data } = validateUserPermissions(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const merged = { ...(user.permissionOverrides || {}) };
  for (const [label, value] of Object.entries(data)) {
    if (value === null) delete merged[label];
    else merged[label] = value;
  }
  user.permissionOverrides = merged;
  user.markModified('permissionOverrides');
  await user.save();
  res.json(user);
}));

/* Deleting an account is not the same as deactivating one: a
   deactivated user keeps their history and can be let back in, a
   deleted one is gone. The UI offers deactivate first for that reason.
   Self-deletion is blocked for the same reason self-deactivation is —
   there is no undo from the outside. */
router.delete('/:id', asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: req.params.id, name: user.name, email: user.email });
}));

router.patch('/:id/password', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { errors, data } = validatePasswordReset(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  user.passwordHash = await hashPassword(data.password);
  await user.save();
  res.json({ ok: true });
}));

/* Logs the caller in AS the target user — no password needed, since
   the whole point is switching into an account you don't hold the
   credentials for. Gated on its own capability (see permissions.js),
   deliberately separate from MANAGE_USERS so holding the latter (e.g.
   Board/CEO) is not enough by itself; only a role a Super Admin
   explicitly grants this to can ever reach it. Logged to the console
   for now — there's no audit-log subsystem yet to write this to.

   The real (originally signed-in) identity rides along as an extra
   claim on the issued token — see signToken()'s own comment — so
   POST /api/auth/revert-impersonation can switch back later, and so
   a page refresh mid-impersonation still knows who "really" is signed
   in. `req.user.realUserId` is already set if this is a SECOND switch
   made while already impersonating someone else; falling back to it
   (rather than always using req.user.id/.email) keeps a chain of
   switches anchored to the one true original account instead of each
   hop overwriting the last. */
router.post('/:id/impersonate', requirePermission('Impersonate other user accounts'), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You are already signed in as this account.' });
  }
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (!target.active) return res.status(400).json({ error: `${target.name}'s account is deactivated.` });

  const realUser = {
    id: req.user.realUserId || req.user.id,
    email: req.user.realUserEmail || req.user.email,
  };
  console.log(`[impersonate] ${realUser.email} switched into ${target.email} (${target.role})`);

  const token = signToken(target, realUser);
  setAuthCookie(res, token);
  res.json({
    user: {
      id: target._id.toString(), email: target.email, name: target.name, role: target.role,
      permissions: resolvedPermissions(target.role, target.permissionOverrides || {}),
    },
  });
}));

export default router;
