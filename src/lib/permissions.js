/* The capability catalogue and the live role table.

   CAPABILITIES are code: each label below is named in a
   requirePermission() call on a real route (see routes/customers.js),
   so this list can only grow when someone writes the enforcement to go
   with it. Nothing in the UI can add to it.

   ROLES are data: which roles exist, and what level each one holds
   against each capability, lives in the Role collection and is managed
   from User management. PERMS below is only the seed used to create
   those rows the first time the app runs — after that the database is
   the truth and this matrix is history. lib/roleStore.js owns loading
   it into the cache this module reads. */
export const PERMS = [
  ['Owner base — names and units', ['F', 'F', 'F', 'F', 'O', 'F', 'F', 'F', 'F']],
  ['Payment ledger and outstanding', ['F', 'F', 'S', 'N', 'N', 'S', 'N', 'F', 'S']],
  ['Unrealised gain and valuation', ['F', 'F', 'S', 'N', 'N', 'S', 'N', 'F', 'N']],
  ['Propensity score and segment', ['F', 'F', 'F', 'S', 'O', 'F', 'N', 'N', 'N']],
  ['Personal dates — DOB, anniversary', ['S', 'S', 'S', 'S', 'O', 'F', 'N', 'N', 'N']],
  ['Complaints and NCR references', ['F', 'S', 'F', 'S', 'O', 'F', 'F', 'N', 'F']],
  ['Litigation flag and case notes', ['F', 'S', 'N', 'N', 'N', 'S', 'N', 'S', 'F']],
  ['Consent record', ['F', 'S', 'S', 'S', 'N', 'F', 'S', 'N', 'F']],
  ['Send a portfolio statement', ['F', 'F', 'S', 'N', 'N', 'F', 'N', 'N', 'N']],
  ['Export the base', ['F', 'S', 'N', 'N', 'N', 'N', 'N', 'S', 'N']],
  ['Change the valuation note', ['S', 'N', 'N', 'N', 'N', 'N', 'N', 'F', 'N']],
  ['Override the contact gate', ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
  ['Owner status and transfer state', ['F', 'S', 'N', 'N', 'N', 'F', 'N', 'N', 'S']],
  ['Engagement data — NPS, referrals, events, visits', ['F', 'F', 'F', 'S', 'O', 'F', 'N', 'N', 'N']],
  ['User management — add/edit/deactivate accounts', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
];

/* the nine roles the matrix above was written for — the seed's column
   order, and nothing more. Live role names come from getRoles(). */
export const SEED_ROLES = ['Board / CEO', 'GM Sales', 'AGM', 'Coordinator', 'RM', 'CRM', 'Service', 'Finance', 'Legal'];

export const CAPABILITIES = PERMS.map(([label]) => label);
export const LEVELS = ['F', 'S', 'O', 'N'];

export const PERM_LABEL = {
  F: { cls: 'yes', t: 'full' },
  S: { cls: 'part', t: 'own scope' },
  O: { cls: 'part', t: 'own customers' },
  N: { cls: 'no', t: 'none' },
};

/* the one row nothing may open — not a role, not a per-user override.
   Every screen in this app (Scoring Engine, Command Centre, Access &
   governance) states as an absolute rule that nobody, at any level,
   can override the contact gate. Letting a role definition reach this
   row would quietly make that promise false, so the role writer forces
   it back to 'N' and hasPermission never consults an override for it. */
export const NON_OVERRIDABLE = 'Override the contact gate';

/* the capability that guards this whole subsystem — pulled out because
   both the role writer and the user routes have to reason about it to
   stop someone locking themselves (or everyone) out. */
export const MANAGE_USERS = 'User management — add/edit/deactivate accounts';

/* name -> { [capability]: level }, replaced wholesale by roleStore on
   boot and after every role write. Requests read it synchronously —
   an async permission check would have to be threaded through twenty
   route handlers for a lookup that is a few dozen strings wide. */
let roleCache = new Map();

export function setRoles(roles) {
  roleCache = new Map(roles.map((r) => [r.name, { ...(r.permissions || {}) }]));
}

export function getRoles() {
  return [...roleCache.entries()].map(([name, permissions]) => ({ name, permissions }));
}

export function roleNames() {
  return [...roleCache.keys()];
}

export function roleExists(name) {
  return roleCache.has(name);
}

/* the level a role holds for one capability. A role that isn't loaded,
   or a capability absent from its map, reads as 'N' — an unknown role
   is not a privileged one. */
export function roleLevel(role, capabilityLabel) {
  if (capabilityLabel === NON_OVERRIDABLE) return 'N';
  return roleCache.get(role)?.[capabilityLabel] || 'N';
}

/* true unless the effective level is 'N'. A per-user override (see
   permissionOverrides in models/User.js) wins over the role's own
   level when present for that exact label — except NON_OVERRIDABLE,
   which always resolves to 'N'. Does not yet distinguish S/O/F
   (own-scope / own-customers record-level filtering needs an ownership
   model this app doesn't have) — see the plan doc for what is
   intentionally deferred. */
export function hasPermission(role, capabilityLabel, overrides) {
  if (capabilityLabel === NON_OVERRIDABLE) return false;
  if (overrides && overrides[capabilityLabel]) return overrides[capabilityLabel] !== 'N';
  return roleLevel(role, capabilityLabel) !== 'N';
}
