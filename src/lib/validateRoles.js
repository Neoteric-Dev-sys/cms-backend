/* Validators for the role-management endpoints. A role is a name plus
   a level per capability — see models/Role.js for why capabilities
   themselves are not editable. */
import { CAPABILITIES, LEVELS, NON_OVERRIDABLE } from './permissions.js';

const VALID_LABELS = new Set(CAPABILITIES);
const VALID_LEVELS = new Set(LEVELS);
const NAME_MAX = 40;

export function validateRoleName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2) return { error: 'Enter a role name of at least 2 characters.', name: null };
  if (name.length > NAME_MAX) return { error: `Keep the role name under ${NAME_MAX} characters.`, name: null };
  return { error: null, name };
}

/* An unknown capability or an invalid level is rejected outright
   rather than dropped — a silently-ignored permission is the kind of
   bug that only shows up as someone seeing data they shouldn't.
   Capabilities left out of the payload land as 'N': absent means no
   access, never "leave whatever was there". */
export function validateRolePermissions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Malformed permissions.', permissions: null };
  }
  const permissions = {};
  for (const [label, level] of Object.entries(raw)) {
    if (!VALID_LABELS.has(label)) return { error: `Unknown capability: ${label}`, permissions: null };
    if (!VALID_LEVELS.has(level)) return { error: `Invalid level for ${label}.`, permissions: null };
    permissions[label] = level;
  }
  for (const label of CAPABILITIES) {
    if (!(label in permissions)) permissions[label] = 'N';
  }
  /* the contact gate is closed for every role, always — see
     NON_OVERRIDABLE in permissions.js. Forced rather than rejected so
     a client that echoes the whole matrix back doesn't have to know. */
  permissions[NON_OVERRIDABLE] = 'N';
  return { error: null, permissions };
}

export function validateRoleCreate(d) {
  const { error: nameError, name } = validateRoleName(d.name);
  if (nameError) return { errors: { name: nameError }, data: null };

  const raw = d.permissions === undefined ? {} : d.permissions;
  const { error: permError, permissions } = validateRolePermissions(raw);
  if (permError) return { errors: { permissions: permError }, data: null };

  return { errors: {}, data: { name, permissions, description: String(d.description || '').trim() } };
}
