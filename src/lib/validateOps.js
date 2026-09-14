/* Validators for the operational-write endpoints added after "Complete
   profile": owner status, litigation, complaints, per-unit loan/
   valuation, NPS, referrals, events, site visits, exit. Kept separate
   from validate.js (create + profile-patch) since these are a distinct
   concern — every field here either flips the Contact Gate (status,
   litigation, openComplaints) or feeds a Score pillar (see derived.js),
   never both invented nor left unvalidated.

   All "not in the future" checks compare against TODAY
   (backend/src/lib/core.js), which is the real calendar date
   normalised to local midnight — so entering today's own date never
   reads as "in the future". */
import { TODAY, TODAY_UTC_MIDNIGHT, fmtD, OCCUPANCIES, projByName } from './core.js';

export const STATUSES = ['ACTIVE', 'EXITED', 'TRANSFER_IN_PROGRESS', 'DECEASED'];
export const REFERRAL_STATUSES = ['Booked', 'Open — no follow-up logged', 'Lost — budget'];
export const CALL_OUTCOMES = [
  'Interested — follow up', 'Not interested', 'No answer', 'Call back later', 'Converted — re-invested',
];

/* This app's "today" is a fixed date, not the real calendar date — a
   plain "can't be in the future" message is confusing when the date
   picker's own browser default is the real today. Naming the app's
   actual today makes clear what the rule is comparing against. */
function parseDateNotFuture(v, label) {
  const s = String(v || '').trim();
  if (!s) return { error: `${label} is required.` };
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return { error: `Enter a valid date for ${label}.` };
  if (dt.getTime() > TODAY_UTC_MIDNIGHT) return { error: `${label} can't be after today (${fmtD(TODAY)}).` };
  return { date: dt };
}

function parseUnitKey(d) {
  const unit = String(d.unit || '').trim();
  const project = String(d.project || '').trim();
  if (!unit || !project) return { error: 'Missing unit reference — reload and try again.' };
  return { unit, project };
}

/* 409-worthy: the loaded document's item at the client-supplied array
   index doesn't match the natural key the client last saw there —
   someone else's edit shifted the array in between. */
export function matchUnit(unit, key) {
  return !!unit && unit.unit === key.unit && unit.project === key.project;
}
export function matchComplaint(item, ncr) {
  return !!item && item.ncr === ncr;
}

export function validateStatusPatch(d) {
  const e = {};
  const status = String(d.status || '').trim();
  if (!STATUSES.includes(status)) e.status = 'Choose a valid status.';
  const statusNote = String(d.statusNote || '').trim();
  if (status !== 'ACTIVE' && !statusNote) {
    e.statusNote = 'Explain the change — required for anything other than Active.';
  }
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { status, statusNote: statusNote || null } };
}

export function validateLitigationPatch(d) {
  return { errors: {}, patch: { litigation: !!d.litigation } };
}

/* unit is required — a complaint is against one specific flat, not
   the owner in the abstract, so "which unit" has to be captured at
   the point of logging or it's unrecoverable later. project is
   optional: the route resolves it from the owner's own units array,
   and only asks the caller to supply it when that owner happens to
   hold more than one unit under the same number (rare, but the Owner
   Base unit filter hit exactly this case — see OwnerBase.jsx). */
export function validateComplaintOpen(d) {
  const e = {};
  const t = String(d.t || '').trim();
  const owner = String(d.owner || '').trim();
  const ncr = String(d.ncr || '').trim();
  const unit = String(d.unit || '').trim();
  const project = String(d.project || '').trim();
  if (!t) e.t = 'Describe the complaint.';
  if (!owner) e.owner = 'Name who owns the fix.';
  if (!ncr) e.ncr = 'Enter the NCR reference.';
  if (!unit) e.unit = 'Choose which unit this complaint is against.';
  const r = parseDateNotFuture(d.raised, 'Raised date');
  if (r.error) e.raised = r.error;
  if (Object.keys(e).length) return { errors: e, patch: null };
  const days = Math.max(0, Math.round((TODAY - r.date) / 86400000));
  return { errors: {}, patch: { t, owner, ncr, unit, project: project || null, raised: r.date, days } };
}

export function validateComplaintClose(d) {
  const ncr = String(d.ncr || '').trim();
  if (!ncr) return { errors: { ncr: 'Missing complaint reference — reload and try again.' }, patch: null };
  /* optional — closing without a stated reason still works (keeps
     every existing caller of this endpoint valid), but the UI should
     always ask for one now */
  const reason = String(d.reason || '').trim().slice(0, 500);
  return { errors: {}, patch: { ncr, reason: reason || null } };
}

export function validateLoanPatch(d) {
  const e = {};
  const key = parseUnitKey(d);
  if (key.error) e.unit = key.error;

  const p = {};
  if (d.bank !== undefined) p.bank = String(d.bank || '').trim() || null;
  if (d.tenure !== undefined) {
    const s = String(d.tenure || '').trim();
    if (!s) p.tenure = 0;
    else {
      const n = Number(s);
      if (Number.isNaN(n) || n < 0) e.tenure = 'Enter a valid tenure in years.';
      else p.tenure = n;
    }
  }
  ['start', 'closure', 'closedOn'].forEach((k) => {
    if (d[k] === undefined) return;
    const s = String(d[k] || '').trim();
    if (!s) { p[k] = null; return; }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) e[k] = 'Enter a valid date.';
    else p[k] = dt;
  });
  if (d.prepaid !== undefined) p.prepaid = !!d.prepaid;
  if (d.selfFunded !== undefined) p.selfFunded = !!d.selfFunded;
  if (d.closed !== undefined) p.closed = !!d.closed;

  if (Object.keys(e).length) return { errors: e, patch: null, key: null };
  return { errors: {}, patch: p, key };
}

export function validateValuationPatch(d) {
  const e = {};
  const key = parseUnitKey(d);
  if (key.error) e.unit = key.error;

  const p = {};
  ['ask', 'resale', 'circle'].forEach((k) => {
    if (d[k] === undefined) return;
    const n = Number(d[k]);
    if (!(n > 0)) e[k] = 'Enter a positive rate.';
    else p[k] = n;
  });
  if (d.notedOn !== undefined) {
    const r = parseDateNotFuture(d.notedOn, 'Note dated');
    if (r.error) e.notedOn = r.error;
    else p.notedOn = r.date.toISOString().slice(0, 10);
  }
  if (d.basis !== undefined) {
    const v = String(d.basis || '').trim();
    if (!v) e.basis = 'State the basis for this note.';
    else p.basis = v;
  }
  if (d.by !== undefined) {
    const v = String(d.by || '').trim();
    if (!v) e.by = 'Name who signed this note.';
    else p.by = v;
  }

  if (Object.keys(e).length) return { errors: e, patch: null, key: null };
  return { errors: {}, patch: p, key };
}

/* Corrects a unit's own identity/area/rate — the fields Intake or a
   raw-list import got wrong or never captured (see MPortfolio's
   "Complete record" banner for the shell-record version of this same
   gap). `unit`/`project` here are the CURRENT key used to find the
   right array element (matchUnit below); the corrected number, if
   changed, travels separately as `newUnit` so renaming a unit never
   collides with the lookup that found it. */
export function validateFinancialsPatch(d) {
  const e = {};
  const key = parseUnitKey(d);
  if (key.error) e.unit = key.error;

  const p = {};
  if (d.newUnit !== undefined) {
    const v = String(d.newUnit || '').trim();
    if (!v) e.newUnit = 'Enter a unit number.';
    else p.unit = v;
  }
  /* project (and the entity it implies — the two must never disagree)
     was entered wrong at booking/import time often enough this session
     to be worth fixing from here rather than only at create time. The
     valuation note (ask/resale/circle/basis) deliberately isn't
     touched — it's the project's own current note, edited separately
     from "Valuation basis" below, and moving a unit shouldn't silently
     borrow the wrong project's numbers or blank out the right ones. */
  if (d.newProject !== undefined) {
    const proj = projByName(d.newProject);
    if (!proj) e.newProject = 'Choose a valid project.';
    else { p.project = proj.name; p.entity = proj.entity; }
  }
  /* saleable/rate are what this form exists to fix, so a blank one is
     a mistake worth stopping for. carpet is supplementary context the
     form happens to also show — blank there just means "not entered",
     same as loading below, not an error. */
  ['saleable', 'rate'].forEach((k) => {
    if (d[k] === undefined) return;
    const n = Number(d[k]);
    if (!(n > 0)) e[k] = 'Enter a positive value.';
    else p[k] = n;
  });
  if (d.carpet !== undefined) {
    const s = String(d.carpet || '').trim();
    if (s) {
      const n = Number(s);
      if (!(n > 0)) e.carpet = 'Enter a positive value.';
      else p.carpet = n;
    }
  }
  if (d.loading !== undefined) {
    const s = String(d.loading || '').trim();
    if (!s) p.loading = 0;
    else {
      const n = Number(s);
      if (Number.isNaN(n) || n < 0) e.loading = 'Enter a valid loading %.';
      else p.loading = n;
    }
  }

  if (Object.keys(e).length) return { errors: e, patch: null, key: null };
  return { errors: {}, patch: p, key };
}

/* Per-unit occupancy for the Investor tab. Unlike the money/legal
   validators above this rejects nothing — an unrecognised value is
   coerced to null ("not captured"), since it only ever arrives from a
   fixed dropdown and a bad value here is a UI bug, not a data claim
   worth holding a whole request over. */
export function validateOccupancyPatch(d) {
  const e = {};
  const key = parseUnitKey(d);
  if (key.error) e.unit = key.error;
  if (Object.keys(e).length) return { errors: e, patch: null, key: null };

  const v = String(d.occupancy || '').trim().toUpperCase();
  return { errors: {}, patch: { occupancy: OCCUPANCIES.includes(v) ? v : null }, key };
}

export function validateNpsPatch(d) {
  const e = {};
  const n = Number(d.nps);
  if (!(Number.isInteger(n) && n >= 0 && n <= 10)) e.nps = 'NPS must be a whole number from 0 to 10.';
  const r = parseDateNotFuture(d.npsDate, 'NPS date');
  if (r.error) e.npsDate = r.error;
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { nps: n, npsDate: r.date } };
}

export function validateReferralPatch(d) {
  const e = {};
  const n = String(d.n || '').trim();
  if (!n) e.n = "Enter the referred person's name.";
  const status = String(d.status || '').trim();
  if (!REFERRAL_STATUSES.includes(status)) e.status = 'Choose a valid status.';
  const r = parseDateNotFuture(d.date, 'Referral date');
  if (r.error) e.date = r.error;
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { n, status, date: r.date } };
}

export function validateEventPatch(d) {
  const e = {};
  const n = String(d.n || '').trim();
  if (!n) e.n = 'Enter the event name.';
  const r = parseDateNotFuture(d.d, 'Event date');
  if (r.error) e.d = r.error;
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { n, d: r.date } };
}

/* the result of a call made off the Trigger Calendar — this is the
   piece that was missing before outcome data exists anywhere to re-fit
   the score weights against (see Activity log's footer note). */
/* Unlike parseDateNotFuture above, a follow-up's whole point is a
   moment that hasn't happened yet — no "not in the future" check here,
   and the value is a full datetime (from a `datetime-local` input),
   not a date-only string, so the time-of-day survives. */
export function validateFollowUpPatch(d) {
  const e = {};
  const note = String(d.note || '').trim();
  if (!note) e.note = 'Enter what to follow up on.';
  const dt = new Date(d.dueAt);
  if (!d.dueAt || Number.isNaN(dt.getTime())) e.dueAt = 'Choose a valid date and time.';
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { note, dueAt: dt } };
}

export function validateCallPatch(d) {
  const e = {};
  const outcome = String(d.outcome || '').trim();
  if (!CALL_OUTCOMES.includes(outcome)) e.outcome = 'Choose a valid outcome.';
  const note = String(d.note || '').trim();
  const r = parseDateNotFuture(d.date, 'Call date');
  if (r.error) e.date = r.error;
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { outcome, note: note || null, date: r.date } };
}

/* Acknowledges one trigger occurrence off the Trigger Calendar — label
   + date together are the natural key (see TriggerAckSchema), so no
   array index/matchX check is needed the way the unit-scoped patches
   above need one. */
export function validateTriggerAckPatch(d) {
  const e = {};
  const label = String(d.label || '').trim();
  if (!label) e.label = 'Missing trigger reference — reload and try again.';
  const date = String(d.date || '').trim();
  if (!date || Number.isNaN(new Date(date).getTime())) e.date = 'Missing trigger date — reload and try again.';
  if (Object.keys(e).length) return { errors: e, patch: null };
  return { errors: {}, patch: { label, date } };
}

/* Agreement / registry / possession dates — these are what the
   Document Vault checklist (frontend derived.js docsFor()) actually
   reads to decide "Sale agreement" / "Registered sale deed" /
   "Possession certificate" are on file; there's no separate document/
   file record anywhere in this app, just these three dates. */
export function validateMilestonesPatch(d) {
  const e = {};
  const key = parseUnitKey(d);
  if (key.error) e.unit = key.error;

  const p = {};
  ['agrDate', 'regDate', 'possDate'].forEach((k) => {
    if (d[k] === undefined) return;
    const s = String(d[k] || '').trim();
    if (!s) { p[k] = null; return; }
    const dt = new Date(s);
    if (Number.isNaN(dt.getTime())) e[k] = 'Enter a valid date.';
    else if (dt.getTime() > TODAY_UTC_MIDNIGHT) e[k] = `Can't be after today (${fmtD(TODAY)}).`;
    else p[k] = dt;
  });

  if (Object.keys(e).length) return { errors: e, patch: null, key: null };
  return { errors: {}, patch: p, key };
}

export function validateExitPatch(d) {
  const e = {};
  const key = parseUnitKey(d);
  if (key.error) e.unit = key.error;
  const r = parseDateNotFuture(d.exitDate, 'Exit date');
  if (r.error) e.exitDate = r.error;
  const rate = Number(d.exitRate);
  if (!(rate > 0)) e.exitRate = 'Enter a positive exit rate.';

  if (Object.keys(e).length) return { errors: e, patch: null, key: null };
  return { errors: {}, patch: { exitDate: r.date, exitRate: rate }, key };
}
