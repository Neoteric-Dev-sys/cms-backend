/* Loads the Role collection into the synchronous cache that
   lib/permissions.js serves every request from, and seeds that
   collection the first time the app runs against an empty database.

   Kept apart from permissions.js so that module stays free of any
   mongoose import — it is pulled in by auth middleware on every single
   request, and by validators that have no business touching the DB. */
import Role from '../models/Role.js';
import { PERMS, SEED_ROLES, MANAGE_USERS, NON_OVERRIDABLE, setRoles } from './permissions.js';

/* Turns the seed matrix (a row per capability, a column per role) into
   one permissions map per role — the shape roles are stored in. */
function seedDocs() {
  return SEED_ROLES.map((name, col) => {
    const permissions = {};
    PERMS.forEach(([label, cells]) => { permissions[label] = cells[col]; });
    permissions[NON_OVERRIDABLE] = 'N';
    return {
      name,
      permissions,
      /* whichever seeded role holds user management is the way back in
         — mark it so nothing can delete or lock it out later */
      system: permissions[MANAGE_USERS] !== 'N',
      description: '',
    };
  });
}

/* Creates the seeded roles only when the collection is empty. Never
   updates an existing row: once someone has edited a role, the matrix
   in permissions.js is history and must not overwrite their change on
   the next restart. */
export async function seedRoles() {
  const count = await Role.estimatedDocumentCount();
  if (count > 0) return { seeded: 0 };
  await Role.insertMany(seedDocs());
  return { seeded: SEED_ROLES.length };
}

/* Re-reads every role into the permission cache. Called on boot and
   after any role write — a role edit has to take effect on the very
   next request, not at the next restart. */
export async function refreshRoles() {
  const roles = await Role.find().lean();
  setRoles(roles);
  return roles;
}
