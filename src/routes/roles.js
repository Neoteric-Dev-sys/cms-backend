import { Router } from 'express';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { requirePermission } from '../lib/auth.js';
import { MANAGE_USERS } from '../lib/permissions.js';
import { validateRoleCreate, validateRoleName, validateRolePermissions } from '../lib/validateRoles.js';
import { refreshRoles } from '../lib/roleStore.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

const canManage = requirePermission(MANAGE_USERS);

/* how many accounts sit on each role — the Roles tab shows it, and the
   delete guard below depends on it. One grouped query rather than one
   count per role. */
async function userCounts() {
  const rows = await User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/* Readable by any signed-in user, not just user managers: the role
   list drives the Access & governance matrix and the role picker, and
   knowing which roles exist is not itself privileged. Editing them is
   — every write below is behind canManage. */
router.get('/', asyncHandler(async (_req, res) => {
  const [roles, counts] = await Promise.all([Role.find().sort({ name: 1 }), userCounts()]);
  res.json(roles.map((r) => ({ ...r.toJSON(), userCount: counts[r.name] || 0 })));
}));

router.post('/', canManage, asyncHandler(async (req, res) => {
  const { errors, data } = validateRoleCreate(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  try {
    const role = await Role.create({ ...data, system: false });
    await refreshRoles();
    res.status(201).json({ ...role.toJSON(), userCount: 0 });
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ errors: { name: 'A role with this name already exists.' } });
    throw err;
  }
}));

/* Rename and/or re-permission in one call — the UI edits them in
   separate dialogs but the guards are common to both. */
router.patch('/:id', canManage, asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });

  const body = req.body || {};
  let renamedFrom = null;

  if (body.name !== undefined) {
    const { error, name } = validateRoleName(body.name);
    if (error) return res.status(400).json({ errors: { name: error } });
    if (name !== role.name) {
      /* the seeded administrator role is the documented way back into
         this screen; renaming it out from under the people who look
         for it by name is a support call waiting to happen */
      if (role.system) return res.status(400).json({ error: 'The built-in administrator role cannot be renamed.' });
      if (await Role.findOne({ name, _id: { $ne: role._id } })) {
        return res.status(400).json({ errors: { name: 'A role with this name already exists.' } });
      }
      renamedFrom = role.name;
      role.name = name;
    }
  }

  if (body.description !== undefined) role.description = String(body.description || '').trim();

  if (body.permissions !== undefined) {
    const { error, permissions } = validateRolePermissions(body.permissions);
    if (error) return res.status(400).json({ errors: { permissions: error } });

    /* two ways to lock everyone out of this screen, both blocked here:
       taking user management off your own role, and taking it off the
       built-in administrator role that exists to be the way back. */
    if (permissions[MANAGE_USERS] === 'N') {
      if (role.name === req.user.role || renamedFrom === req.user.role) {
        return res.status(400).json({ error: 'You cannot remove user management from your own role.' });
      }
      if (role.system) {
        return res.status(400).json({ error: 'The built-in administrator role must keep user management.' });
      }
    }
    role.permissions = permissions;
    role.markModified('permissions');
  }

  await role.save();
  /* a rename has to carry the accounts with it, or everyone on the old
     name silently drops to an unknown role — which resolves to no
     access at all (see roleLevel in permissions.js) */
  if (renamedFrom) await User.updateMany({ role: renamedFrom }, { role: role.name });
  await refreshRoles();

  const counts = await userCounts();
  res.json({ ...role.toJSON(), userCount: counts[role.name] || 0 });
}));

router.delete('/:id', canManage, asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) return res.status(404).json({ error: 'Role not found' });
  if (role.system) return res.status(400).json({ error: 'The built-in administrator role cannot be deleted.' });
  if (role.name === req.user.role) return res.status(400).json({ error: 'You cannot delete your own role.' });

  /* deleting a role out from under its holders would leave those
     accounts on a name nothing resolves — reassign them first, so the
     decision about where those people land is made by a person */
  const inUse = await User.countDocuments({ role: role.name });
  if (inUse) {
    return res.status(400).json({
      error: `${inUse} account${inUse === 1 ? ' is' : 's are'} still on this role. Move them to another role first.`,
    });
  }

  await role.deleteOne();
  await refreshRoles();
  res.json({ id: req.params.id, name: role.name });
}));

export default router;
