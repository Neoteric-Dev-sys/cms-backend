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
  /* the Events MODULE (create an event, manage its invite list) — a
     different thing from the row above, which is an owner-level log
     of events THEY attended. Mirrors that row's F/S/O/N pattern since
     it's the same kind of "marketing/relationship" action, just scoped
     to the shared event list rather than one customer's record. */
  ['Manage events and invite lists', ['F', 'F', 'F', 'S', 'O', 'F', 'N', 'N', 'N']],
  ['User management — add/edit/deactivate accounts', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
  /* deliberately 'N' for every one of the nine seed roles, including
     Board/CEO — this is the one capability that's meant to belong to
     Super Admin alone, not to "whoever holds User management".
     ensureSuperAdminRole() (see roleStore.js) grants 'F' on every
     capability except NON_OVERRIDABLE, so Super Admin gets this one
     without it needing a row here at all; it's listed anyway so it
     shows up in Access & Governance's matrix like every other
     capability, instead of being an invisible special case. */
  ['Impersonate other user accounts', ['N', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],

  /* ---- module visibility — one row per sidebar page ----
     Everything above gates a specific ACTION (log a complaint, edit a
     valuation note, ...) and several actions can share one row. These
     gate whether a role sees the PAGE at all (Sidebar.jsx's own filter,
     and PageGate for a direct URL hit) — always F ("visible") or N
     ("hidden"); S/O never meant anything for "can you see this tab"
     the way they do for a data action, so nothing here ever writes
     them, even though the same four-value UI control still shows for
     consistency. Seeded to reproduce EXACTLY what each role could
     already reach the day this list was added (derived from the
     action rows above, e.g. Trigger calendar mirrors Engagement data),
     so turning this on changes nothing on its own — it just makes each
     page's access independently editable going forward instead of
     several pages moving together because they happened to share one
     action capability. See constants/navigation.js's `capability`
     field on the frontend for which row gates which route. */
  ['Module: Dashboard', ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']],
  ['Module: Owner base', ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']],
  ['Module: Trigger calendar', ['F', 'F', 'F', 'F', 'F', 'F', 'N', 'N', 'N']],
  ['Module: Referral tree', ['F', 'F', 'F', 'F', 'F', 'F', 'N', 'N', 'N']],
  ['Module: Events', ['F', 'F', 'F', 'F', 'F', 'F', 'N', 'N', 'N']],
  ['Module: Portfolio statement', ['F', 'F', 'F', 'N', 'N', 'F', 'N', 'N', 'N']],
  ['Module: Statement send log', ['F', 'F', 'F', 'N', 'N', 'F', 'N', 'N', 'N']],
  ['Module: Intake & exceptions', ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']],
  ['Module: Incomplete records', ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']],
  ['Module: Valuation register', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'F', 'N']],
  ['Module: Exit register', ['F', 'F', 'N', 'N', 'N', 'F', 'N', 'N', 'F']],
  ['Module: Scoring engine', ['F', 'F', 'F', 'F', 'F', 'F', 'N', 'N', 'N']],
  ['Module: Field dictionary', ['F', 'F', 'F', 'F', 'F', 'F', 'F', 'F', 'F']],
  ['Module: Access & governance', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
  ['Module: User management', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
  ['Module: Master data', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
  /* gates the Audit log viewer page — same F/N split as User management,
     Access & governance and Master data above: the audit trail is who
     did what to every account and every record, so it's Super Admin/
     Board-CEO territory, not something a broader "manage users" grant
     was ever meant to widen into on its own (see MODULE_SOURCE below,
     which still derives its default from MANAGE_USERS for the backfill
     case — the seed row here is what a brand-new database gets). */
  ['Module: Audit log', ['F', 'N', 'N', 'N', 'N', 'N', 'N', 'N', 'N']],
];

/* Every "Module: X" row above, in one place — constants/navigation.js
   (frontend) has the id/label/route each one maps to; this side just
   needs the plain label list so nothing has to hardcode "starts with
   Module:" string-matching wherever it's used. */
export const MODULE_CAPABILITIES = PERMS
  .map(([label]) => label)
  .filter((label) => label.startsWith('Module: '));

/* Which action capability each module row's DEFAULT is derived from —
   used only by roleStore.js's one-time backfill, for the role that's
   missing the module row entirely (added to the catalogue after that
   role was created/last saved). `null` means "always visible,
   independent of any action capability" (Dashboard, Field dictionary
   were never gated on anything). Read live off THAT ROLE's own
   current permissions at backfill time, not off the SEED_ROLES column
   index — a custom role someone created from the UI (not one of the
   nine seeds) has no column here at all, so this is what makes the
   backfill correct for it too, not just for the original nine. */
export const MODULE_SOURCE = {
  'Module: Dashboard': null,
  'Module: Owner base': 'Owner base — names and units',
  'Module: Trigger calendar': 'Engagement data — NPS, referrals, events, visits',
  'Module: Referral tree': 'Engagement data — NPS, referrals, events, visits',
  'Module: Events': 'Manage events and invite lists',
  'Module: Portfolio statement': 'Send a portfolio statement',
  'Module: Statement send log': 'Send a portfolio statement',
  'Module: Intake & exceptions': 'Owner base — names and units',
  'Module: Incomplete records': 'Owner base — names and units',
  'Module: Valuation register': 'Change the valuation note',
  'Module: Exit register': 'Owner status and transfer state',
  'Module: Scoring engine': 'Propensity score and segment',
  'Module: Field dictionary': null,
  /* literal string, not the MANAGE_USERS constant — that's declared
     further down this same file, after this object is evaluated. */
  'Module: Access & governance': 'User management — add/edit/deactivate accounts',
  'Module: User management': 'User management — add/edit/deactivate accounts',
  'Module: Master data': 'User management — add/edit/deactivate accounts',
  'Module: Audit log': 'User management — add/edit/deactivate accounts',
};

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

/* Every capability resolved to a plain boolean for this user — sent to
   the frontend on login/session-restore so a PermissionGate can hide
   or disable a control before the user ever clicks it and hits the
   same requirePermission() 403 the route itself enforces. This is a
   convenience/UX layer, not the authorization boundary: every route
   above still checks requirePermission() itself regardless of what
   the client believes it can do. */
export function resolvedPermissions(role, overrides) {
  const out = {};
  CAPABILITIES.forEach((label) => { out[label] = hasPermission(role, label, overrides); });
  return out;
}
