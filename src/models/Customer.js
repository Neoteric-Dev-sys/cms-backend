import mongoose from 'mongoose';

const { Schema } = mongoose;

/* Mirrors the raw Customer shape from src/lib/generator.js exactly —
   see the plan doc for the full field trace. Subdocuments use
   { _id: false } so the JSON shape stays identical to the original
   in-memory objects the frontend already knows how to render. */

const LoanSchema = new Schema({
  bank: { type: String, default: null },
  tenure: { type: Number, default: 0 },
  start: { type: Date, default: null },
  closure: { type: Date, default: null },
  closed: { type: Boolean, default: false },
  closedOn: { type: Date },
  prepaid: { type: Boolean, default: false },
  selfFunded: { type: Boolean, default: false },
}, { _id: false });

const ValSchema = new Schema({
  ask: Number,
  resale: Number,
  circle: Number,
  notedOn: String,
  basis: String,
  by: String,
}, { _id: false });

const UnitSchema = new Schema({
  unit: { type: String, default: null },
  project: { type: String, default: null },
  entity: String,
  type: String,
  carpet: Number,
  saleable: Number,
  loading: Number,
  bookDate: Date,
  agrDate: { type: Date, default: null },
  regDate: { type: Date, default: null },
  possDate: { type: Date, default: null },
  rate: Number,
  discount: { type: Number, default: 0 },
  consideration: Number,
  paid: Number,
  receipts: { type: Number, default: 0 },
  bounced: { type: Number, default: 0 },
  lastReceipt: Date,
  loan: LoanSchema,
  val: ValSchema,
  exited: { type: Boolean, default: false },
  exitDate: { type: Date },
  exitRate: { type: Number },
  /* SELF_OCCUPIED | RENTED | VACANT | null — per unit, not per owner:
     a multi-unit investor typically lives in one and rents the rest,
     so a single owner-level flag would be wrong for exactly the people
     this field matters most for. */
  occupancy: { type: String, default: null },
}, { _id: false });

const ComplaintSchema = new Schema({
  t: String,
  raised: Date,
  closed: Date,
  days: Number,
  /* which unit the complaint was against — a multi-unit owner's
     complaints aren't interchangeable (a seepage in one flat says
     nothing about the other three), so this has been unit-scoped
     since it stopped being owner-level. project is carried alongside
     purely for display; the unit alone is what the route matched on. */
  unit: { type: String, default: null },
  project: { type: String, default: null },
  /* why it was closed — optional so historical rows (closed before
     this existed) don't need backfilling, but every close from here
     on should carry one */
  closeReason: { type: String, default: null },
}, { _id: false });

const OpenComplaintSchema = new Schema({
  t: String,
  raised: Date,
  days: Number,
  owner: String,
  ncr: String,
  unit: { type: String, default: null },
  project: { type: String, default: null },
}, { _id: false });

const ReferralSchema = new Schema({
  n: String,
  date: Date,
  status: String,
}, { _id: false });

const EventSchema = new Schema({
  n: String,
  d: Date,
}, { _id: false });

/* Manual, staff-written reminders — distinct from the system-computed
   "Dated reasons to make contact" (birthdays, LTCG windows, etc. — see
   MTriggers.jsx): a follow-up is only ever created by a person, about
   something only they know to check back on. Keeps its own real _id
   (unlike units/complaints above) since it's addressed directly by
   id, not by array index + a composite key — nothing about a
   follow-up's position in the list is ever load-bearing. */
const FollowUpSchema = new Schema({
  note: { type: String, required: true },
  dueAt: { type: Date, required: true },
  done: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  createdBy: { type: String, default: null },
});

const StatementSchema = new Schema({
  d: Date,
  v: String,
  ch: String,
  opened: Boolean,
  profileDone: Boolean,
  disputed: Boolean,
  askedToSell: Boolean,
  askedNewProject: Boolean,
}, { _id: false });

/* the one thing missing before the score weights can ever be re-fit
   against real outcomes (see Activity log's own footer note) — a call
   made off the Trigger Calendar needs its result captured somewhere,
   not just the fact that a reason to call existed. */
const CallSchema = new Schema({
  date: Date,
  outcome: String,
  note: { type: String, default: null },
  by: String,
}, { _id: false });

const ChildSchema = new Schema({
  n: String,
  dob: Date,
}, { _id: false });

/* One row per trigger occurrence acknowledged off the Trigger Calendar
   — `label` + `date` together identify a single dated reason (see
   triggerList() in the frontend's derived.js), so a recurring trigger
   like "Birthday" acknowledged this year doesn't stay acknowledged next
   year, when the date is different. */
const TriggerAckSchema = new Schema({
  label: { type: String, required: true },
  date: { type: String, required: true },
  ackedOn: { type: Date, default: Date.now },
  by: { type: String, default: null },
  remark: { type: String, default: null },
}, { _id: false });

const ConsentSchema = new Schema({
  whatsapp: { type: Boolean, default: false },
  sms: { type: Boolean, default: false },
  email: { type: Boolean, default: false },
  marketing: { type: Boolean, default: false },
  date: { type: Date, default: null },
  purpose: { type: String, default: null },
  children: { type: Boolean, default: false },
}, { _id: false });

const CapturedSchema = new Schema({
  dob: { type: Boolean, default: false },
  anniv: { type: Boolean, default: false },
  kid: { type: Boolean, default: false },
  occ: { type: Boolean, default: false },
  addr: { type: Boolean, default: false },
}, { _id: false });

const ReferredBySchema = new Schema({
  n: String,
  id: String,
}, { _id: false });

/* One row per page attached to a Document Vault checklist row (see
   docsFor() in the frontend's derived.js) — `key` matches that row's
   stable key (e.g. 'kyc', 'agreement-GC-C-305'). A multi-page paper
   document (a sale agreement scanned as 3 photos, say) is several
   DocumentSchema rows sharing that key, ordered by `page`, and every
   upload adds page(s) rather than replacing what's there. Keeps its
   own real `_id` (unlike most of this file's sub-schemas) so a single
   page can be deleted without touching the others on the same key.
   `source` 'upload' is Cloudinary-hosted (see lib/cloudinary.js) and
   carries a `publicId` to delete later; 'link' just points `url` at
   wherever the file already lives (a shared Google Drive folder,
   typically) and has no Cloudinary asset behind it to clean up. */
const DocumentSchema = new Schema({
  key: { type: String, required: true },
  page: { type: Number, default: 1 },
  source: { type: String, enum: ['upload', 'link'], default: 'upload' },
  filename: String,
  url: { type: String, required: true },
  publicId: { type: String, default: null },
  uploadedAt: { type: Date, default: null },
});

const CustomerSchema = new Schema({
  id: { type: String, required: true, unique: true, index: true },
  status: { type: String, enum: ['ACTIVE', 'EXITED', 'TRANSFER_IN_PROGRESS', 'DECEASED'], default: 'ACTIVE' },
  statusSince: { type: Date, default: null },
  statusNote: { type: String, default: null },
  salutation: String,
  name: { type: String, default: '' },
  coApplicant: { type: String, default: null },
  coRelation: { type: String, default: 'Spouse' },
  coOnAgreement: { type: Boolean, default: false },
  dob: { type: Date, default: null },
  spouseDob: { type: Date, default: null },
  children: { type: [ChildSchema], default: [] },
  pan: { type: String, required: false, default: null, index: true },
  aadhaarHeld: { type: Boolean, default: false },
  aadhaarNo: { type: String, default: null },
  kycDate: { type: Date, default: null },
  mobile: { type: String, default: '', index: true },
  email: { type: String, default: null },
  corrAddr: String,
  city: String,
  occupation: String,
  occBand: Number,
  incomeBand: { type: String, default: null },
  community: String,
  /* INVESTOR | END_USER | null — captured by a human, never inferred:
     the Investor tab shows behavioural signals (units held, prior
     exits, holding period) as a *suggestion* alongside this, but the
     stored classification is only ever what someone actually set. */
  ownerType: { type: String, default: null },
  captured: CapturedSchema,
  consent: ConsentSchema,
  source: String,
  referredBy: { type: ReferredBySchema, default: null },
  units: { type: [UnitSchema], default: [] },
  complaints: { type: [ComplaintSchema], default: [] },
  openComplaints: { type: [OpenComplaintSchema], default: [] },
  nps: { type: Number, default: null },
  npsDate: { type: Date, default: null },
  litigation: { type: Boolean, default: false },
  referrals: { type: [ReferralSchema], default: [] },
  events: { type: [EventSchema], default: [] },
  followUps: { type: [FollowUpSchema], default: [] },
  siteVisits: { type: Number, default: 0 },
  portalLast: { type: Date, default: null },
  statements: { type: [StatementSchema], default: [] },
  documents: { type: [DocumentSchema], default: [] },
  calls: { type: [CallSchema], default: [] },
  triggerAcks: { type: [TriggerAckSchema], default: [] },
  /* true for a "shell" record created from a raw allotment/inventory
     list that has no PAN and/or no confirmed unit financials yet — a
     real, common state for legacy data migration, distinct from a
     validation failure (see Intake's exceptions queue for that). Kept
     out of enrich()/score/gate/confidence entirely (frontend
     AppContext filters on this before enrich runs) since those all
     assume a real PAN and real unit numbers; always recomputed from
     the actual fields on write (see validateIncomplete.js), never set
     directly by a client. */
  incomplete: { type: Boolean, default: false },
}, {
  toJSON: {
    transform: (_doc, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

/* the two fields every owner-matching flow keys on today (bulk-import
   dedupe by name+mobile, the bulk complaints import matching by
   project+unit — see Intake.jsx and customers.js' /complaints route)
   run as an in-memory scan over Customer.find({}) results, so this
   index doesn't speed up anything that exists right now — every route
   still fetches the whole collection either way at current scale.
   It's here for when a route starts filtering by these in the query
   itself (the app already fetches the full base client-side and
   plans to paginate server-side past ~1,000 owners — see Owner Base). */
CustomerSchema.index({ 'units.project': 1, 'units.unit': 1 });

export default mongoose.model('Customer', CustomerSchema);
