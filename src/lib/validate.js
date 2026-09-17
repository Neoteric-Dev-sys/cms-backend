/* Validation on customer data import is intentionally OFF — every
   check that used to reject a row (name length, PAN format/dedupe,
   mobile format, project match, rate×area reconciliation, date
   sanity, occupation/community list match) has been removed so a
   row is never held. validateDraft() always returns no errors;
   buildCustomer()/validateProfilePatch() instead coerce whatever was
   given into safe values (a bad number becomes null, an unmatched
   project falls back to the first known project, a missing pan/name/
   mobile becomes an empty value) so the app never crashes on garbage
   input — but nothing is ever guessed into a "valid-looking" number
   the way the old reconciliation check was designed to prevent. */
import { TODAY, projByName, PROJECTS, OCC, OWNER_TYPES, computeIncomplete } from './core.js';

/* the bulk-import sheet (see FULL_FORM_FIELDS in the frontend's
   intake.js) uses flat Yes/No text columns for booleans and consent,
   since a spreadsheet cell can't hold a nested object or a real
   boolean — this turns those into what validateProfilePatch expects
   before reusing its per-field logic below, rather than duplicating
   that mapping here. */
function parseYesNo(v) {
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'true' || s === '1';
}
export function normalizeProfileInput(d) {
  const out = { ...d };
  if (typeof out.coOnAgreement === 'string') out.coOnAgreement = parseYesNo(out.coOnAgreement);
  const consentKeys = ['consentWhatsapp', 'consentSms', 'consentEmail', 'consentMarketing', 'consentChildren'];
  if (consentKeys.some((k) => d[k] !== undefined) || d.consentPurpose !== undefined) {
    out.consent = {
      whatsapp: parseYesNo(d.consentWhatsapp), sms: parseYesNo(d.consentSms), email: parseYesNo(d.consentEmail),
      marketing: parseYesNo(d.consentMarketing), children: parseYesNo(d.consentChildren),
      purpose: d.consentPurpose,
    };
  }
  return out;
}

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

/* kept as a function (rather than deleted outright) so the route
   shape — validate, then build — doesn't have to change; it simply
   never has anything to report. */
export function validateDraft() {
  return {};
}

/* One unit sub-document, built from a flat draft the same way every
   bulk-import/quick-add row already is — extracted out of
   buildCustomer() below so "add another unit to an existing owner"
   (see customers.js' POST /:id/units) builds the exact same shape
   instead of a second, driftable copy of it. */
export function buildUnit(d) {
  const p = projByName(d.project) || PROJECTS[0];
  const bd = dateOrNull(d.bookDate);
  const sa = numOrNull(d.saleable), rt = numOrNull(d.rate), dc = numOrNull(d.discount) ?? 0, co = numOrNull(d.consideration), pd = numOrNull(d.paid);
  return {
    unit: d.unit ? String(d.unit).trim() : null, project: p.name, entity: p.entity, type: '—',
    carpet: sa != null ? Math.round(sa * 0.68) : null, saleable: sa, loading: 32,
    bookDate: bd, agrDate: null, regDate: null, possDate: null,
    rate: rt, discount: dc, consideration: co, paid: pd ?? 0,
    receipts: pd ? 1 : 0, bounced: 0, lastReceipt: bd,
    loan: { bank: null, tenure: 0, start: null, closure: null, closed: true, prepaid: false, selfFunded: true },
    val: { ask: p.ask, resale: p.resale, circle: p.circle, notedOn: p.noted, basis: p.basis, by: p.by },
    exited: false,
  };
}

/* Port of buildCustomer() from src/lib/intake.js — takes a draft +
   a freshly-issued id and returns the raw Customer shape. Never
   throws: an unmatched project falls back to PROJECTS[0] (rather
   than crashing on `p.entity` of undefined), a bad/missing number or
   date becomes null rather than NaN or an Invalid Date. */
export function buildCustomer(d, id) {
  const bd = dateOrNull(d.bookDate);
  const pan = d.pan ? String(d.pan).replace(/\s/g, '').toUpperCase() : null;

  const profile = validateProfilePatch(normalizeProfileInput(d)).patch;
  const captured = { dob: false, anniv: false, kid: false, occ: false, addr: false };
  if (profile.dob) captured.dob = true;
  if (profile.spouseDob) captured.anniv = true;
  if (profile.occupation) captured.occ = true;
  if (profile.corrAddr) captured.addr = true;
  const hasConsent = profile.consent && Object.entries(profile.consent).some(([k, v]) => k !== 'purpose' && v === true);

  const unit = buildUnit(d);

  return {
    id, status: 'ACTIVE', statusSince: bd || TODAY, statusNote: null,
    salutation: d.salutation ? String(d.salutation).trim() : 'Mr.',
    name: d.name ? String(d.name).trim() : '',
    coApplicant: profile.coApplicant ?? null, coRelation: profile.coRelation ?? 'Spouse', coOnAgreement: profile.coOnAgreement ?? false,
    dob: profile.dob ?? null, spouseDob: profile.spouseDob ?? null, children: [],
    pan, aadhaarHeld: false, aadhaarNo: null, kycDate: profile.kycDate ?? bd,
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
    /* recomputed here rather than trusted from validateDraft (which no
       longer rejects anything) — a customer created through this
       strict route with a blank rate/saleable/consideration must
       still come out `incomplete`, or it flows into the scored owner
       base with a null rate and crashes anything that formats it
       (e.g. activityFor()'s u.rate.toLocaleString()). */
    incomplete: computeIncomplete(pan, unit),
  };
}

/* Applies a PATCH /api/customers/:id body (the "complete profile"
   form) or a create/shell-import draft's profile columns — every key
   is optional, and nothing here rejects a value anymore. A bad date
   or email is stored as null rather than erroring; occupation and
   community are always free text (no fixed-list match required —
   occBand/incomeBand fall back to their defaults, 50/null, whenever
   the value isn't one of the known OCC entries). */
export function validateProfilePatch(d) {
  const e = {};
  const p = {};

  if (d.salutation !== undefined) p.salutation = String(d.salutation || '').trim() || null;
  /* every field on this form is optional, name included — a record
     that's genuinely incomplete (see validateIncomplete.js's shell
     path) can have its name filled in later the same way any other
     "not captured yet" field is, rather than being rejected outright
     because one field was blank. */
  if (d.name !== undefined) p.name = String(d.name || '').trim();
  if (d.mobile !== undefined) p.mobile = String(d.mobile || '').trim() || null;
  if (d.altMobile !== undefined) p.altMobile = String(d.altMobile || '').trim() || null;
  if (d.pan !== undefined) p.pan = String(d.pan || '').replace(/\s/g, '').toUpperCase() || null;
  if (d.aadhaarHeld !== undefined) p.aadhaarHeld = !!d.aadhaarHeld;
  if (d.aadhaarNo !== undefined) p.aadhaarNo = String(d.aadhaarNo || '').replace(/\s/g, '') || null;
  if (d.source !== undefined) p.source = String(d.source || '').trim() || null;
  if (d.dob !== undefined) p.dob = dateOrNull(d.dob);
  if (d.spouseDob !== undefined) p.spouseDob = dateOrNull(d.spouseDob);
  if (d.email !== undefined) p.email = String(d.email || '').trim() || null;
  if (d.kycDate !== undefined) p.kycDate = dateOrNull(d.kycDate);
  if (d.coApplicant !== undefined) p.coApplicant = String(d.coApplicant || '').trim() || null;
  if (d.coRelation !== undefined) p.coRelation = String(d.coRelation || '').trim() || 'Spouse';
  if (d.coOnAgreement !== undefined) p.coOnAgreement = !!d.coOnAgreement;
  if (d.corrAddr !== undefined) p.corrAddr = String(d.corrAddr || '').trim() || null;
  if (d.city !== undefined) p.city = String(d.city || '').trim() || null;

  if (d.occupation !== undefined) {
    const v = String(d.occupation || '').trim();
    if (!v) p.occupation = null;
    else {
      const o = OCC.find((x) => x.k === v);
      if (o) { p.occupation = o.k; p.occBand = o.b; p.incomeBand = o.band; }
      else p.occupation = v;
    }
  }

  if (d.community !== undefined) p.community = String(d.community || '').trim() || null;

  /* coerced to the known set rather than rejected — anything
     unrecognised reads as "not captured", same reject-nothing/
     guess-nothing shape as every other field here. */
  if (d.ownerType !== undefined) {
    const v = String(d.ownerType || '').trim().toUpperCase();
    p.ownerType = OWNER_TYPES.includes(v) ? v : null;
  }

  if (d.consent !== undefined) {
    const cs = d.consent || {};
    p.consent = {
      whatsapp: !!cs.whatsapp, sms: !!cs.sms, email: !!cs.email, marketing: !!cs.marketing,
      children: !!cs.children, purpose: String(cs.purpose || '').trim() || null,
    };
  }

  return { errors: e, patch: p };
}
