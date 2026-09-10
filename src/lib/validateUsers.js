/* Validators for the User Management endpoints — kept separate from
   validate.js/validateOps.js since a User is a different concern
   entirely from a Customer (accounts, not owners). */
import { CAPABILITIES, roleExists, roleNames, NON_OVERRIDABLE } from './permissions.js';

const VALID_LABELS = new Set(CAPABILITIES);

/* roles come from the live cache, so a role created a minute ago is
   assignable a minute later — see lib/roleStore.js. */
const badRole = () => `Choose a valid role (${roleNames().join(', ')}).`;
const VALID_VALUES = new Set(['F', 'S', 'O', 'N']);

export function validateUserCreate(d) {
  const e = {};
  const name = String(d.name || '').trim();
  if (!name || name.length < 2) e.name = 'Enter the person\'s name.';

  const email = String(d.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email address.';

  const role = String(d.role || '').trim();
  if (!roleExists(role)) e.role = badRole();

  const password = String(d.password || '');
  if (password.length < 8) e.password = 'Password must be at least 8 characters.';

  if (Object.keys(e).length) return { errors: e, data: null };
  return { errors: {}, data: { name, email, role, password } };
}

export function validateUserPatch(d) {
  const e = {};
  const p = {};

  if (d.name !== undefined) {
    const name = String(d.name || '').trim();
    if (!name || name.length < 2) e.name = 'Enter the person\'s name.';
    else p.name = name;
  }
  if (d.role !== undefined) {
    const role = String(d.role || '').trim();
    if (!roleExists(role)) e.role = badRole();
    else p.role = role;
  }
  if (d.active !== undefined) p.active = !!d.active;

  /* profile fields — free text, capped so nobody pastes a novel into a
     phone number field; no other validation, since nothing downstream
     reads these to decide access or behaviour */
  for (const k of ['phone', 'employeeId', 'designation', 'department']) {
    if (d[k] !== undefined) p[k] = String(d[k] || '').trim().slice(0, 60);
  }

  if (Object.keys(e).length) return { errors: e, data: null };
  return { errors: {}, data: p };
}

/* body: { overrides: { [capabilityLabel]: 'F'|'S'|'O'|'N' } }. A label
   missing from the incoming object is left untouched on the user (use
   a dedicated "clear" to remove one, see the route); a label present
   with an invalid value is rejected outright rather than silently
   dropped, since a silently-ignored override is a permission bug
   waiting to happen. */
export function validateUserPermissions(d) {
  const overrides = d.overrides;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return { errors: { overrides: 'Malformed request.' }, data: null };
  }
  const e = {};
  const clean = {};
  for (const [label, value] of Object.entries(overrides)) {
    if (!VALID_LABELS.has(label)) { e.overrides = `Unknown capability: ${label}`; break; }
    if (label === NON_OVERRIDABLE) { e.overrides = 'The contact gate can never be overridden, for any user.'; break; }
    if (value === null) { clean[label] = null; continue; }
    if (!VALID_VALUES.has(value)) { e.overrides = `Invalid value for ${label}.`; break; }
    clean[label] = value;
  }
  if (Object.keys(e).length) return { errors: e, data: null };
  return { errors: {}, data: clean };
}

export function validatePasswordReset(d) {
  const password = String(d.password || '');
  if (password.length < 8) return { errors: { password: 'Password must be at least 8 characters.' }, data: null };
  return { errors: {}, data: { password } };
}
