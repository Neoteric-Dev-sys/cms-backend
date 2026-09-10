/* "Shell" owner records — created from a raw allotment/inventory list
   (name, mobile, project, unit) that has no PAN and/or no confirmed
   unit financials yet. Validation on this path (and on completing a
   shell record) is intentionally OFF, same as validate.js — nothing
   here rejects a row; a bad/missing value is coerced to null or a
   safe fallback instead. */
import { TODAY, projByName, PROJECTS, computeIncomplete } from './core.js';
import { validateProfilePatch, normalizeProfileInput } from './validate.js';

export { computeIncomplete };

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dateOrNull(v) {
  if (!v) return null;
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/* kept as a function so the route's validate-then-build shape doesn't
   have to change; it simply never has anything to report. */
export function validateShellDraft() {
  return {};
}

/* mirrors buildCustomer() in validate.js but leaves pan/saleable/rate/
   discount/consideration/bookDate/paid null wherever the draft didn't
   provide them, instead of defaulting to a value that would look like
   real, confirmed data. Never throws on garbage input — see validate.js. */
export function buildShellCustomer(d, id) {
  const p = projByName(d.project) || PROJECTS[0];
  const bd = dateOrNull(d.bookDate);
  const sa = numOrNull(d.saleable), rt = numOrNull(d.rate), dc = numOrNull(d.discount) ?? 0, co = numOrNull(d.consideration), pd = numOrNull(d.paid) ?? 0;
  const pan = d.pan ? String(d.pan).replace(/\s/g, '').toUpperCase() : null;

  const profile = validateProfilePatch(normalizeProfileInput(d)).patch;
  const captured = { dob: false, anniv: false, kid: false, occ: false, addr: false };
  if (profile.dob) captured.dob = true;
  if (profile.spouseDob) captured.anniv = true;
  if (profile.occupation) captured.occ = true;
  if (profile.corrAddr) captured.addr = true;
  const hasConsent = profile.consent && Object.entries(profile.consent).some(([k, v]) => k !== 'purpose' && v === true);

  const unit = {
    unit: d.unit ? String(d.unit).trim() : null, project: p.name, entity: p.entity, type: '—',
    carpet: sa != null ? Math.round(sa * 0.68) : null, saleable: sa, loading: 32,
    bookDate: bd, agrDate: null, regDate: null, possDate: null,
    rate: rt, discount: dc, consideration: co, paid: pd,
    receipts: pd > 0 ? 1 : 0, bounced: 0, lastReceipt: bd,
    loan: { bank: null, tenure: 0, start: null, closure: null, closed: true, prepaid: false, selfFunded: true },
    val: { ask: p.ask, resale: p.resale, circle: p.circle, notedOn: p.noted, basis: p.basis, by: p.by },
    exited: false,
  };

  return {
    id, status: 'ACTIVE', statusSince: bd || TODAY, statusNote: null,
    salutation: d.salutation ? String(d.salutation).trim() : 'Mr.',
    name: d.name ? String(d.name).trim() : '',
    coApplicant: profile.coApplicant ?? null, coRelation: profile.coRelation ?? 'Spouse', coOnAgreement: profile.coOnAgreement ?? false,
    dob: profile.dob ?? null, spouseDob: profile.spouseDob ?? null, children: [],
    pan, aadhaarHeld: false, kycDate: profile.kycDate ?? null,
    mobile: d.mobile ? String(d.mobile).trim() : '', email: profile.email ?? null,
    corrAddr: profile.corrAddr ?? 'Address not updated since booking', city: profile.city ?? 'Gwalior',
    occupation: profile.occupation ?? 'Not captured', occBand: profile.occBand ?? 50, incomeBand: profile.incomeBand ?? null,
    community: profile.community ?? 'Other',
    captured,
    consent: profile.consent
      ? { ...profile.consent, date: hasConsent ? TODAY : null }
      : { whatsapp: false, sms: false, email: false, marketing: false, date: null, purpose: null, children: false },
    source: d.source ? String(d.source).trim() : 'Direct walk-in', referredBy: null,
    units: [unit],
    complaints: [], openComplaints: [], nps: null, npsDate: null, litigation: false,
    referrals: [], events: [], siteVisits: 0, portalLast: null, statements: [],
    incomplete: computeIncomplete(pan, unit),
  };
}

/* PATCH /api/customers/:id/complete — fills in the fields a shell
   record was missing. No longer rejects an incomplete/malformed
   attempt; a blank or bad value is simply left null, so the record
   may still compute as `incomplete` afterward (computeIncomplete is
   always re-derived, never trusted from this patch directly). */
export function validateCompletion(d) {
  const pan = d.pan ? String(d.pan).replace(/\s/g, '').toUpperCase() : null;
  const sa = numOrNull(d.saleable), rt = numOrNull(d.rate), dc = numOrNull(d.discount) ?? 0, co = numOrNull(d.consideration), pd = numOrNull(d.paid) ?? 0;
  const bd = dateOrNull(d.bookDate);

  return {
    errors: {},
    patch: { pan, unit: { saleable: sa, rate: rt, discount: dc, consideration: co, paid: pd, bookDate: bd } },
  };
}
