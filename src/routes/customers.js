import { Router } from 'express';
import multer from 'multer';
import Customer from '../models/Customer.js';
import Counter, { nextCustomerId } from '../models/Counter.js';
import { isCloudinaryConfigured, uploadBuffer, deleteAsset } from '../lib/cloudinary.js';
import { validateDraft, buildCustomer, buildUnit, validateProfilePatch } from '../lib/validate.js';
import { validateShellDraft, buildShellCustomer, validateCompletion } from '../lib/validateIncomplete.js';
import {
  validateStatusPatch, validateLitigationPatch, validateComplaintOpen, validateComplaintClose,
  validateLoanPatch, validateValuationPatch, validateNpsPatch, validateReferralPatch,
  validateEventPatch, validateExitPatch, validateMilestonesPatch, validateCallPatch,
  validateOccupancyPatch, validateFinancialsPatch, validateTriggerAckPatch, validateFollowUpPatch,
  validateSegmentOverridePatch, validateReceiptPatch,
  matchUnit, matchComplaint, parseUnitKey,
} from '../lib/validateOps.js';
import { gate } from '../lib/gate.js';
import { TODAY, computeIncomplete, normName, normMobile } from '../lib/core.js';
import { requirePermission } from '../lib/auth.js';
import { hasPermission, MANAGE_USERS } from '../lib/permissions.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

/* Same person, another booking — an owner's second (or fifth) unit
   should land in their existing `units[]`, not spawn a second Customer
   document under a new id. Matched on name + mobile together (see
   normName/normMobile) since name alone isn't a safe identity check
   against this app's small, fixed sample-name pool. Used by both
   creation routes below, right before what would otherwise be a plain
   Customer.create(raw). Gap-fills a few scalar fields onto the
   existing record from the new draft where the existing one is still
   blank, same as the one-off dedupe script this mirrors; returns null
   (meaning "create as a new customer, no match") when name or mobile
   is missing, since that can't be safely matched at all. */
const PROFILE_GAP_FILL = ['pan', 'email', 'corrAddr', 'city', 'occupation', 'community', 'dob', 'salutation', 'source'];
async function mergeIntoExistingOwner(raw) {
  const nName = normName(raw.name);
  const nMobile = normMobile(raw.mobile);
  if (!nName || !nMobile) return null;

  const candidates = await Customer.find({}, 'id name mobile');
  const hit = candidates.find((c) => normName(c.name) === nName && normMobile(c.mobile) === nMobile);
  if (!hit) return null;

  const existing = await Customer.findOne({ id: hit.id });
  existing.units.push(raw.units[0]);
  existing.markModified('units');
  for (const f of PROFILE_GAP_FILL) {
    const existingEmpty = existing[f] == null || existing[f] === '';
    const newHas = raw[f] != null && raw[f] !== '';
    if (existingEmpty && newHas) existing[f] = raw[f];
  }
  existing.incomplete = computeIncomplete(existing.pan, existing.units[0]);
  await existing.save();
  return existing;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype);
    cb(ok ? null : new Error('UNSUPPORTED_FILE_TYPE'), ok);
  },
});

router.get('/', asyncHandler(async (_req, res) => {
  const customers = await Customer.find().sort({ id: 1 });
  res.json(customers);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

router.post('/', asyncHandler(async (req, res) => {
  const draft = req.body || {};
  /* .filter(Boolean) matters now that a "shell" record (see
     validateIncomplete.js) can have pan: null — every PAN dedupe check
     calls .toUpperCase() on each entry, which throws on null */
  const existing = await Customer.find({}, 'pan');
  const errors = validateDraft(draft, existing.map((c) => c.pan).filter(Boolean));
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  /* built with a placeholder id first — real id generation only
     happens below if this doesn't turn out to be another booking for
     an owner already on file, so a merge never burns a sequence
     number for a Customer document that's never created. */
  const raw = buildCustomer(draft, 'PENDING');
  const merged = await mergeIntoExistingOwner(raw);
  if (merged) return res.status(200).json({ ...merged.toJSON(), merged: true });

  raw.id = await nextCustomerId();
  try {
    const created = await Customer.create(raw);
    res.status(201).json(created);
  } catch (err) {
    /* a duplicate PAN slipping past the pre-check above (a second
       request landed in the gap between the check and this insert) is
       the one failure mode worth a field-level error instead of a
       bare 500 — everything else falls through to the global handler */
    if (err.code === 11000) {
      return res.status(400).json({ errors: { pan: 'Duplicate PAN — this owner already exists.' } });
    }
    throw err;
  }
}));

/* creates a "shell" owner from a raw allotment/inventory list — only
   name/mobile/project/unit required, PAN and unit financials optional.
   Gated the same as the milestones route (general day-to-day CRM data
   entry) since, like that one, this doesn't map cleanly onto any
   single existing PERMS row. See validateIncomplete.js for why this is
   a genuinely separate path from the strict create route above rather
   than a relaxed mode of it. */
router.post('/incomplete', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const draft = req.body || {};
  const existing = await Customer.find({}, 'pan');
  const errors = validateShellDraft(draft, existing.map((c) => c.pan).filter(Boolean));
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const raw = buildShellCustomer(draft, 'PENDING');
  const merged = await mergeIntoExistingOwner(raw);
  if (merged) return res.status(200).json({ ...merged.toJSON(), merged: true });

  raw.id = await nextCustomerId();
  try {
    const created = await Customer.create(raw);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ errors: { pan: 'Duplicate PAN — this owner already exists.' } });
    }
    throw err;
  }
}));

/* fills in the PAN + unit financials a shell record was missing —
   the moment it becomes a real, scoreable customer. Targets the first
   unit, since every shell record is created with exactly one. */
router.patch('/:id/complete', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const others = await Customer.find({ id: { $ne: customer.id } }, 'pan');
  const { errors, patch } = validateCompletion(req.body || {}, others.map((c) => c.pan).filter(Boolean));
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.pan = patch.pan;
  Object.assign(customer.units[0], patch.unit);
  customer.incomplete = false;
  customer.markModified('units');
  await customer.save();
  res.json(customer);
}));

/* "Complete profile" — fills in the fields the Data Confidence
   checklist flags as missing. Gated on one representative PERMS row
   rather than per-field (dob/anniversary, consent and identity fields
   sit under three different rows in the matrix; full per-row/per-field
   enforcement needs a customer-ownership model this app doesn't have
   yet — see the plan doc), matching the same single-permission-per-
   endpoint approach already used for the statements route below. */
router.patch('/:id', requirePermission('Personal dates — DOB, anniversary'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateProfilePatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const CAPTURE_FLAG = { dob: 'dob', spouseDob: 'anniv', corrAddr: 'addr', occupation: 'occ' };
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'consent') {
      Object.assign(customer.consent, value);
      continue;
    }
    customer[key] = value;
    if (CAPTURE_FLAG[key]) customer.captured[CAPTURE_FLAG[key]] = value != null;
  }
  if (patch.consent && !customer.consent.date) customer.consent.date = TODAY;
  /* pan is one of the fields incomplete-ness is judged on (see
     computeIncomplete) — a shell record filled in from here, not just
     from the dedicated /complete route, should stop showing as
     incomplete too. Judged against units[0] only, same as /complete —
     this flag has never been multi-unit-aware. */
  if (patch.pan !== undefined) customer.incomplete = computeIncomplete(customer.pan, customer.units[0]);

  await customer.save();
  res.json(customer);
}));

router.post('/:id/statements', requirePermission('Send a portfolio statement'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const g = gate(customer.toObject());
  if (!g.open) return res.status(409).json({ error: `Blocked by the gate: ${g.label}` });

  customer.statements.push({
    d: TODAY,
    v: req.body?.v || 'v1.0',
    ch: req.body?.ch || 'WhatsApp PDF',
    opened: false,
    profileDone: false,
    disputed: false,
    askedToSell: false,
    askedNewProject: false,
  });
  await customer.save();
  res.status(201).json(customer);
}));

/* =====================================================================
   BATCH 1 — owner status, litigation, complaints. status/litigation/
   openComplaints are the three gate-critical fields a human can now
   directly flip (see GATE_ORDER in derived.js / gate.js) — every write
   here changes whether this owner can be contacted at all, not just a
   score pillar.
   ===================================================================== */

router.patch('/:id/status', requirePermission('Owner status and transfer state'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateStatusPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.status = patch.status;
  customer.statusNote = patch.statusNote;
  customer.statusSince = TODAY;
  await customer.save();
  res.json(customer);
}));

router.patch('/:id/litigation', requirePermission('Litigation flag and case notes'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { patch } = validateLitigationPatch(req.body || {});
  customer.litigation = patch.litigation;
  await customer.save();
  res.json(customer);
}));

/* Forces the segment chip to a specific A/B/C/D instead of whatever
   segOf() computes (see derived.js) — a documented exception to the
   scoring rules, not a way around them: has no visible effect while
   the Contact Gate is closed, since segOf() forces 'C' there
   regardless of this override. An empty `seg` clears it back to the
   computed value. */
router.patch('/:id/segment-override', requirePermission('Propensity score and segment'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateSegmentOverridePatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.segmentOverride = patch.seg
    ? { seg: patch.seg, reason: patch.reason, by: req.user.name, date: TODAY }
    : { seg: null, reason: null, by: null, date: null };
  await customer.save();
  res.json(customer);
}));

router.post('/:id/complaints', requirePermission('Complaints and NCR references'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateComplaintOpen(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  /* the unit alone disambiguates for a single owner's own portfolio —
     project is only asked for in the rare case where this specific
     owner holds two units sharing a number (see validateOps.js) */
  const candidates = customer.units.filter((u) =>
    u.unit === patch.unit && (!patch.project || u.project === patch.project));
  if (!candidates.length) {
    return res.status(400).json({ errors: { unit: `This owner has no unit "${patch.unit}"${patch.project ? ` in ${patch.project}` : ''}.` } });
  }
  if (candidates.length > 1) {
    /* if every candidate is in the same project, they're literal
       duplicate unit records (a data-entry/merge artefact), not
       genuinely different units to choose between — the complaint
       reads identically against either one, so there's nothing to
       disambiguate and nothing to guess. Only distinct projects are a
       real ambiguity worth holding on. */
    const distinctProjects = new Set(candidates.map((u) => u.project));
    if (distinctProjects.size > 1) {
      return res.status(400).json({ errors: { project: `This owner holds more than one unit "${patch.unit}" — also state the project.` } });
    }
  }

  customer.openComplaints.push({ ...patch, project: candidates[0].project });
  await customer.save();
  res.status(201).json(customer);
}));

router.post('/:id/complaints/:index/close', requirePermission('Complaints and NCR references'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateComplaintClose(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const item = customer.openComplaints[idx];
  if (!matchComplaint(item, patch.ncr)) {
    return res.status(409).json({ error: 'This complaint list changed since you loaded it — refresh and try again.' });
  }

  customer.openComplaints.splice(idx, 1);
  customer.complaints.push({
    t: item.t,
    raised: item.raised,
    closed: TODAY,
    days: Math.max(0, Math.round((TODAY - item.raised) / 86400000)),
    unit: item.unit,
    project: item.project,
    closeReason: patch.reason,
  });
  await customer.save();
  res.json(customer);
}));

/* =====================================================================
   BATCH 2 — per-unit loan and valuation note. Both addressed by array
   index with a natural-key ({unit, project}) safety check, since
   units[] has no stored per-item id (see plan doc) — a stale index
   409s instead of silently editing the wrong unit.
   ===================================================================== */

router.patch('/:id/units/:index/loan', requirePermission('Payment ledger and outstanding'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateLoanPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  Object.assign(unit.loan, patch);
  customer.markModified('units');
  await customer.save();
  res.json(customer);
}));

/* Per-unit occupancy (Investor tab). Gated on the same row as names/
   units rather than the money rows — this is a plain fact about the
   unit, not a figure that reaches a customer statement. */
router.patch('/:id/units/:index/occupancy', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateOccupancyPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  unit.occupancy = patch.occupancy;
  customer.markModified('units');
  await customer.save();
  res.json(customer);
}));

router.patch('/:id/units/:index/valuation', requirePermission('Change the valuation note'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateValuationPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  Object.assign(unit.val, patch);
  customer.markModified('units');
  await customer.save();
  res.json(customer);
}));

/* Corrects a unit's own number, area and rate — the fields Intake or a
   raw-list import got wrong, for an owner who's already a complete,
   scored record (the shell-record version of this same gap is the
   /complete route above). Gated the same as the unit's other base
   facts, not the money routes — this is what those money figures are
   *computed from*, not a ledger entry itself. */
router.patch('/:id/units/:index/financials', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateFinancialsPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  Object.assign(unit, patch);
  customer.markModified('units');
  /* saleable/rate are two of the fields incomplete-ness is judged on
     (see computeIncomplete) — judged against units[0] specifically,
     same as the /complete route, since this flag has never been
     multi-unit-aware; editing a later unit doesn't change it. */
  if (idx === 0) customer.incomplete = computeIncomplete(customer.pan, unit);
  await customer.save();
  res.json(customer);
}));

/* Logs one payment received — adds to paid-to-date rather than
   replacing it (see validateReceiptPatch and MLedger.jsx's own note on
   why paid is never a hand-typed total), bumps the receipt count, and
   moves lastReceipt forward if this one is more recent than whatever
   was on file. */
router.post('/:id/units/:index/receipts', requirePermission('Payment ledger and outstanding'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateReceiptPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  unit.paid = (unit.paid || 0) + patch.amount;
  unit.receipts = (unit.receipts || 0) + 1;
  if (!unit.lastReceipt || patch.date > unit.lastReceipt) unit.lastReceipt = patch.date;
  customer.markModified('units');
  await customer.save();
  res.status(201).json(customer);
}));

/* agreement/registry/possession dates — these are exactly what the
   Document Vault checklist reads (see docsFor() in derived.js), so
   editing them here is what actually makes "View"/"Request" reflect
   reality instead of always showing "not on file". */
router.patch('/:id/units/:index/milestones', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateMilestonesPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  Object.assign(unit, patch);
  customer.markModified('units');
  await customer.save();
  res.json(customer);
}));

/* Document Vault upload — attaches one or more real files (Cloudinary-
   hosted) as pages under one checklist row (see docsFor()'s `key` in
   derived.js). Every upload ADDS page(s) after whatever's already on
   file for that key, rather than replacing it — a multi-page paper
   document rarely gets scanned in one sitting, so "upload" and "add
   another page" are the same action here. Use the delete route below
   to remove a page uploaded by mistake. */
router.post('/:id/documents', requirePermission('Owner base — names and units'), upload.array('files', 20), asyncHandler(async (req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(500).json({ error: 'Document storage is not set up yet — add CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET to the backend .env.' });
  }
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (!req.files?.length) return res.status(400).json({ errors: { file: 'Choose one or more PDF, JPG or PNG files.' } });

  const key = String(req.body?.key || '').trim();
  if (!key) return res.status(400).json({ errors: { file: 'Missing document reference — reload and try again.' } });

  const folder = `neoteric-connect/${customer.id}`;
  let nextPage = customer.documents.filter((x) => x.key === key).length + 1;
  for (const file of req.files) {
    const filename = `${key}-${Date.now()}-${nextPage}`;
    const { url, publicId } = await uploadBuffer(file.buffer, { folder, filename });
    customer.documents.push({ key, page: nextPage, filename: file.originalname, url, publicId, uploadedAt: TODAY });
    nextPage++;
  }
  customer.markModified('documents');
  await customer.save();
  res.status(201).json(customer);
}));

/* Document Vault — attaches one or more pages that already live
   somewhere else (a shared Google Drive folder, typically) by URL
   instead of a re-uploaded copy. Same additive, one-row-per-page
   shape as a real upload (see the route above), all numbered in one
   pass so pasting several links at once can't race a second request
   for the next page number — this just skips Cloudinary entirely,
   since there's no file here for this app to store. `urls` (an array)
   is the normal shape; a lone `url` string still works the same way
   for a single link. */
router.post('/:id/documents/link', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const key = String(req.body?.key || '').trim();
  if (!key) return res.status(400).json({ errors: { url: 'Missing document reference — reload and try again.' } });

  const raw = Array.isArray(req.body?.urls) ? req.body.urls : [req.body?.url];
  const urls = raw.map((u) => String(u || '').trim()).filter(Boolean);
  if (!urls.length) return res.status(400).json({ errors: { url: 'Paste at least one link.' } });
  const bad = urls.find((u) => !/^https?:\/\//i.test(u));
  if (bad) {
    return res.status(400).json({ errors: { url: `"${bad}" isn't a full link — it must start with http:// or https://.` } });
  }

  let nextPage = customer.documents.filter((x) => x.key === key).length + 1;
  urls.forEach((url) => {
    customer.documents.push({ key, page: nextPage, source: 'link', filename: 'Linked document', url, uploadedAt: TODAY });
    nextPage++;
  });
  customer.markModified('documents');
  await customer.save();
  res.status(201).json(customer);
}));

/* Removes one uploaded page — the rest of that key's pages (and their
   own page numbers) are untouched, so deleting page 2 of 3 just leaves
   pages 1 and 3 rather than renumbering everything. */
router.delete('/:id/documents/:docId', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const doc = customer.documents.id(req.params.docId);
  if (!doc) return res.status(404).json({ error: 'Page not found — reload and try again.' });

  await deleteAsset(doc.publicId);
  doc.deleteOne();
  customer.markModified('documents');
  await customer.save();
  res.json(customer);
}));

/* =====================================================================
   BATCH 3 — NPS, referrals, events, site visits. All four are Score-
   only inputs (engagement/trust pillars) — none of them touch the
   Contact Gate.
   ===================================================================== */

router.patch('/:id/nps', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateNpsPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.nps = patch.nps;
  customer.npsDate = patch.npsDate;
  await customer.save();
  res.json(customer);
}));

router.post('/:id/referrals', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateReferralPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.referrals.push(patch);
  await customer.save();
  res.status(201).json(customer);
}));

router.post('/:id/events', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateEventPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.events.push(patch);
  await customer.save();
  res.status(201).json(customer);
}));

/* Manual reminders (see FollowUpSchema) — the Notification Bell reads
   these across every owner the same way it already reads the
   system-computed Trigger Calendar list, so a staff-written "call back
   next Tuesday about the loan" note surfaces exactly like a birthday
   does, without a push service or scheduled job: the bell just checks
   "is dueAt now or past, and not done" whenever the app is open. */
router.post('/:id/followups', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateFollowUpPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.followUps.push({ ...patch, createdBy: req.user.name });
  await customer.save();
  res.status(201).json(customer);
}));

router.patch('/:id/followups/:followupId', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const followUp = customer.followUps.id(req.params.followupId);
  if (!followUp) return res.status(404).json({ error: 'Follow-up not found.' });

  /* toggling done is the common case and never touches note/dueAt;
     editing either of those re-validates them the same as on create.
     Un-doing a completed follow-up is gated separately, one tier up
     (the same MANAGE_USERS capability Settings/User Management already
     use as this app's closest thing to "admin") — anyone who can log
     engagement can mark one done, but reopening a record of contact
     that already happened is a step only that tier should be able to
     take back. */
  if (req.body?.done !== undefined) {
    const reopening = followUp.done && !req.body.done;
    if (reopening && !hasPermission(req.user.role, MANAGE_USERS, req.user.permissionOverrides)) {
      return res.status(403).json({ error: `Your role (${req.user.role}) cannot undo a completed follow-up.` });
    }
    followUp.done = !!req.body.done;
  } else {
    const { errors, patch } = validateFollowUpPatch({ note: req.body?.note ?? followUp.note, dueAt: req.body?.dueAt ?? followUp.dueAt });
    if (Object.keys(errors).length) return res.status(400).json({ errors });
    followUp.note = patch.note;
    followUp.dueAt = patch.dueAt;
  }

  await customer.save();
  res.json(customer);
}));

router.delete('/:id/followups/:followupId', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const followUp = customer.followUps.id(req.params.followupId);
  if (!followUp) return res.status(404).json({ error: 'Follow-up not found.' });
  followUp.deleteOne();

  await customer.save();
  res.json(customer);
}));

router.post('/:id/site-visits', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  /* +1 by default; -1 to undo a mis-click — never below 0 */
  const delta = req.body?.delta === -1 ? -1 : 1;
  customer.siteVisits = Math.max(0, (customer.siteVisits || 0) + delta);
  await customer.save();
  res.json(customer);
}));

/* the missing half of the Trigger Calendar loop — a reason to call
   someone is worthless if what happened on the call is never recorded
   anywhere (see Activity log's own footer note about re-fitting the
   score weights against real outcomes). */
router.post('/:id/calls', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateCallPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  customer.calls.push({ ...patch, by: req.user.name });
  await customer.save();
  res.status(201).json(customer);
}));

/* Marks one trigger occurrence (a specific label due on a specific
   date — see TriggerAckSchema) as handled, so the "due today" dot on
   the sidebar, the notification bell and this owner's own Trigger
   Calendar row all clear for it. A repeat post for the same label+date
   is a no-op rather than a duplicate row, since the popover/page can
   both fire it if clicked twice before the UI updates. */
router.post('/:id/trigger-acks', requirePermission('Engagement data — NPS, referrals, events, visits'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch } = validateTriggerAckPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const already = customer.triggerAcks.some((a) => a.label === patch.label && a.date === patch.date);
  if (!already) {
    customer.triggerAcks.push({ ...patch, by: req.user.name });
    await customer.save();
  }
  res.status(201).json(customer);
}));

/* =====================================================================
   BATCH 4 — exit register. Marking a unit exited is customer-status-
   aware: a customer keeps status ACTIVE as long as at least one live
   unit remains, and only flips to EXITED once every unit they hold has
   exited (matches the seed generator's own invariant — see ExitRegister
   .jsx, which was fixed alongside this to stop assuming exactly one
   exited unit per EXITED customer).
   ===================================================================== */

router.patch('/:id/units/:index/exit', requirePermission('Owner status and transfer state'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const { errors, patch, key } = validateExitPatch(req.body || {});
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }

  unit.exited = true;
  unit.exitDate = patch.exitDate;
  unit.exitRate = patch.exitRate;
  customer.markModified('units');

  if (customer.units.every((u) => u.exited)) {
    customer.status = 'EXITED';
    customer.statusSince = TODAY;
    customer.statusNote = customer.statusNote || 'All units exited.';
  }

  await customer.save();
  res.json(customer);
}));

/* Adds another unit to an existing owner — the direct-from-Customer-
   Master path for a second/third booking, instead of the only other
   way this happens today (re-running the bulk owner import with the
   same name+mobile, which merges in via mergeIntoExistingOwner). Built
   with the exact same buildUnit() the bulk import and quick-add form
   already use, so the shape can't drift between the three entry
   points. Refuses an exact project+unit duplicate of one already on
   this owner's record — this session's own duplicate-unit clean-up is
   exactly the mistake this guards against; edit the existing unit
   instead of adding a second copy of it. */
router.post('/:id/units', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const draft = req.body || {};
  const project = String(draft.project || '').trim();
  const unitNo = String(draft.unit || '').trim();
  if (!project) return res.status(400).json({ errors: { project: 'Choose a project.' } });
  if (!unitNo) return res.status(400).json({ errors: { unit: 'Enter a unit number.' } });

  const dupe = customer.units.some((u) => u.project === project && u.unit === unitNo);
  if (dupe) {
    return res.status(409).json({ error: `${customer.name} already has a unit "${unitNo}" in ${project} — edit that one instead of adding a duplicate.` });
  }

  const unit = buildUnit({ ...draft, project, unit: unitNo });
  customer.units.push(unit);
  customer.markModified('units');
  await customer.save();
  res.status(201).json(customer);
}));

/* Removes one unit sub-document from an owner's record — the fix path
   for a duplicate/erroneous unit entry (e.g. the same project+unit
   booked twice by a merge or bulk-import mistake), not a way to record
   a real disposal (that's "Mark exited" above, which keeps the unit's
   history). Refuses to leave an owner with zero units — the rest of
   the app (Owner Base's project/unit columns, roll(), the segment/
   gate pipeline) assumes at least one; deleting the last one is what
   "Delete owner" on Owner Base is for instead. */
router.delete('/:id/units/:index', requirePermission('Owner base — names and units'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOne({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const key = parseUnitKey(req.body || {});
  if (key.error) return res.status(400).json({ error: key.error });

  const idx = Number(req.params.index);
  const unit = customer.units[idx];
  if (!matchUnit(unit, key)) {
    return res.status(409).json({ error: 'This unit list changed since you loaded it — refresh and try again.' });
  }
  if (customer.units.length <= 1) {
    return res.status(400).json({ error: 'An owner must keep at least one unit — delete the owner instead if none should remain.' });
  }

  customer.units.splice(idx, 1);
  customer.markModified('units');
  customer.incomplete = computeIncomplete(customer.pan, customer.units[0]);
  await customer.save();
  res.json(customer);
}));

/* Deletes one owner permanently. Gated on the owner-lifecycle row
   rather than the generous names/units one — removing a record is the
   most extreme version of changing an owner's state, and unlike
   marking someone EXITED it cannot be walked back. The UI asks for a
   confirmation naming the owner before calling this; there's no typed
   phrase like the wipe-everything route below, since the blast radius
   here is a single record the caller explicitly picked. */
router.delete('/:id', requirePermission('Owner status and transfer state'), asyncHandler(async (req, res) => {
  const customer = await Customer.findOneAndDelete({ id: req.params.id });
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json({ id: customer.id, name: customer.name });
}));

/* Wipes every customer record and resets the id counter back to 0 so
   the next import starts clean at NEO-C-1 — the same operation the
   one-off migration scripts (backend/clearAllCustomers.js) were doing
   by hand all session. Genuinely irreversible and affects every owner
   at once, so it's gated on the same permission as account management
   (Board/CEO only) and requires the exact confirmation phrase in the
   body as a server-side backstop behind the UI's own confirm dialog —
   a stray or scripted call with an empty body does nothing. */
router.delete('/', requirePermission('User management — add/edit/deactivate accounts'), asyncHandler(async (req, res) => {
  if (req.body?.confirm !== 'DELETE ALL CUSTOMERS') {
    return res.status(400).json({ error: 'Missing or incorrect confirmation phrase.' });
  }
  const { deletedCount } = await Customer.deleteMany({});
  await Counter.findOneAndUpdate({ name: 'customerSeq' }, { $set: { seq: 0 } }, { upsert: true });
  res.json({ deletedCount });
}));

export default router;
