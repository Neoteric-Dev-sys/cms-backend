/* Loads the Role collection into the synchronous cache that
   lib/permissions.js serves every request from, and seeds that
   collection the first time the app runs against an empty database.

   Kept apart from permissions.js so that module stays free of any
   mongoose import — it is pulled in by auth middleware on every single
   request, and by validators that have no business touching the DB. */
import Role from '../models/Role.js';
import { PERMS, SEED_ROLES, CAPABILITIES, MANAGE_USERS, NON_OVERRIDABLE, MODULE_CAPABILITIES, MODULE_SOURCE, setRoles } from './permissions.js';

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

/* Guarantees one true super-admin role exists, on both a brand-new
   database (where seedRoles() above already ran) and an existing one
   that predates this role — an idempotent upsert-by-name, not part of
   the once-only seed, so it self-heals in every environment without a
   migration script someone has to remember to run. Full ('F') access
   to every real capability, same as any other role, EXCEPT
   NON_OVERRIDABLE: "Override the contact gate" is a hard compliance
   rule (DPDP marketing consent), not a permission level, and
   hasPermission() already refuses to grant it to anyone regardless of
   what's stored here — see permissions.js. Marked `system: true` for
   the same reason Board/CEO is: whoever holds it can never be locked
   out of this screen. An already-existing "Super Admin" row is never
   overwritten on a capability it already has an explicit value for —
   once created, it's a normal role someone can edit like any other,
   and a restart must not silently re-widen a deliberately narrowed
   one — but it IS backfilled with 'F' on any capability added to the
   catalogue *after* the row was first created, since roleLevel()
   otherwise reads a genuinely-absent key as 'N' and Super Admin quietly
   stops being "full access to everything" the moment permissions.js
   grows a new row. */
export async function ensureSuperAdminRole() {
  const role = await Role.findOne({ name: 'Super Admin' });
  if (!role) {
    const permissions = {};
    CAPABILITIES.forEach((label) => { permissions[label] = label === NON_OVERRIDABLE ? 'N' : 'F'; });
    await Role.create({
      name: 'Super Admin',
      permissions,
      system: true,
      description: 'Full access to every capability. Cannot be locked out of user management.',
    });
    return { created: true, backfilled: [] };
  }

  const backfilled = CAPABILITIES.filter((label) => !(label in role.permissions));
  if (!backfilled.length) return { created: false, backfilled: [] };
  backfilled.forEach((label) => { role.permissions[label] = label === NON_OVERRIDABLE ? 'N' : 'F'; });
  role.markModified('permissions');
  await role.save();
  return { created: false, backfilled };
}

/* Backfills the "Module: X" rows (see permissions.js) onto every
   EXISTING role that predates them — every role that already existed
   the moment this app added per-module visibility rows to the
   catalogue, seed or custom alike (a role someone created from the
   User Management UI has no SEED_ROLES column to fall back on the way
   ensureSuperAdminRole() does for that one specific role, so this
   reads each role's OWN current permissions instead, live, to derive
   a value that reproduces exactly what it could already reach).
   Never touches a module row a role already has an explicit value
   for — this only fills a genuinely missing key, once, the same
   "don't silently re-widen a deliberate edit" rule as the Super Admin
   backfill above. A role's own value for a module's source capability
   (MODULE_SOURCE) decides the default; `null` in MODULE_SOURCE means
   the module was never gated on anything (Dashboard, Field
   dictionary), so every role gets 'F'. */
export async function backfillModuleCapabilities() {
  const roles = await Role.find();
  let touched = 0;
  for (const role of roles) {
    const missing = MODULE_CAPABILITIES.filter((label) => !(label in role.permissions));
    if (!missing.length) continue;
    missing.forEach((label) => {
      const source = MODULE_SOURCE[label];
      /* a source that's absent from this role's map entirely (not just
         explicitly 'N') must default the module to 'N' too — otherwise
         a module row added in the SAME change as its own source
         capability (both genuinely new to every pre-existing role)
         reads the missing source as "not denied" and silently grants
         page visibility nobody actually opened up. Absent and 'N' both
         mean "no access", never "F". */
      const level = source ? role.permissions[source] : undefined;
      role.permissions[label] = !source || (level && level !== 'N') ? 'F' : 'N';
    });
    role.markModified('permissions');
    await role.save();
    touched += 1;
  }
  return { touched, total: roles.length };
}

/* Re-reads every role into the permission cache. Called on boot and
   after any role write — a role edit has to take effect on the very
   next request, not at the next restart. */
export async function refreshRoles() {
  const roles = await Role.find().lean();
  setRoles(roles);
  return roles;
}
