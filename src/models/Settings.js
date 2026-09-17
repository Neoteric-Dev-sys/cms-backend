import mongoose from 'mongoose';

const { Schema } = mongoose;

/* Every one of these mirrors a list that used to be hardcoded into
   lib/core.js (the backend's own copy) and the frontend's
   constants/projects.js + constants/seedData.js — the Master Data
   page (see routes/settings.js) is now the one place that edits them;
   lib/masterDataStore.js loads this document's lists into the
   synchronous in-memory cache validate.js/validateOps.js read from,
   the same "DB row → cache the app's synchronous code actually reads"
   shape as lib/roleStore.js already uses for roles/permissions. */
const ProjectSchema = new Schema({
  code: String, name: { type: String, required: true }, entity: { type: String, required: true },
  launch: Number, lr: Number, ask: Number, resale: Number, circle: Number,
  noted: String, by: String, basis: String,
}, { _id: false });

const OccupationSchema = new Schema({
  k: { type: String, required: true }, b: Number, band: String,
}, { _id: false });

/* One document, always the same _id ('singleton'), holding the system
   config that used to be hardcoded into whatever page needed it first
   — starting with the Portfolio Statement's letterhead (company name,
   registered office, CIN, GSTIN), now also every dropdown's master
   list. A Super Admin edits this from User Management's Settings tab
   or the Master Data page; every other screen just reads it. */
const SettingsSchema = new Schema({
  _id: { type: String, default: 'singleton' },
  companyName: { type: String, default: 'Neoteric Properties Private Limited' },
  groupLine: { type: String, default: 'A Neoteric Group Company · Navayan Realty · Heaven Heights' },
  regdOffice: { type: String, default: '4th Floor, Neoteric Towers, City Centre, Gwalior – 474011, Madhya Pradesh' },
  cin: { type: String, default: 'U70200MP2014PTC034521' },
  gstin: { type: String, default: '23AAFCN1234M1Z5' },

  projects: {
    type: [ProjectSchema],
    default: [
      { code: 'GC', name: 'Garden City', entity: 'Neoteric Properties', launch: 2019, lr: 1850, ask: 7200, resale: 6450, circle: 4100, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '6 registered resales, Towers A–C, Apr–Jun 2026' },
      { code: 'RG', name: 'Regal Garden', entity: 'Neoteric Properties', launch: 2021, lr: 2000, ask: 6900, resale: 6100, circle: 3900, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '5 registered resales, Tower A, Apr–Jun 2026' },
      { code: 'ED', name: 'Eden Garden', entity: 'Neoteric Properties', launch: 2020, lr: 1950, ask: 6800, resale: 5980, circle: 3800, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '3 registered resales, Block C, May–Jun 2026' },
      { code: 'WS', name: 'Westage', entity: 'Neoteric Properties', launch: 2021, lr: 2100, ask: 6700, resale: 5900, circle: 3800, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '3 registered resales, May–Jun 2026' },
      { code: 'NP', name: 'Nature Park', entity: 'Navayan Realty', launch: 2022, lr: 2350, ask: 6200, resale: 5450, circle: 3600, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '4 registered resales, Block A, May–Jun 2026' },
      { code: 'ZG', name: 'Zen Garden', entity: 'Navayan Realty', launch: 2023, lr: 2800, ask: 5900, resale: 5150, circle: 3400, noted: '2026-06-30', by: 'Finance — Head of Accounts', basis: '2 registered resales, Jun 2026' },
      { code: 'WT', name: 'Wildflower Township', entity: 'Navayan Realty', launch: 2024, lr: 3200, ask: 5400, resale: 4700, circle: 3200, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: 'circle rate only — no resale yet' },
      { code: 'HP', name: 'Hyde Park', entity: 'Heaven Heights', launch: 2022, lr: 2600, ask: 6400, resale: 5600, circle: 3700, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '3 registered resales, Apr–Jun 2026' },
      { code: 'TS', name: 'The Statement', entity: 'Heaven Heights', launch: 2023, lr: 3400, ask: 6600, resale: 5800, circle: 3900, noted: '2026-03-31', by: 'Finance — Head of Accounts', basis: '1 registered resale, Feb 2026 — thin evidence' },
    ],
  },
  occupations: {
    type: [OccupationSchema],
    default: [
      { k: 'Business — Trading', b: 82, band: '₹15 L – ₹50 L' },
      { k: 'Business — Manufacturing', b: 88, band: '₹50 L – ₹1 Cr' },
      { k: 'Doctor', b: 90, band: '₹50 L – ₹1 Cr' },
      { k: 'Advocate', b: 74, band: '₹15 L – ₹50 L' },
      { k: 'Chartered Accountant', b: 84, band: '₹50 L – ₹1 Cr' },
      { k: 'Govt. Service — Class I', b: 70, band: '₹15 L – ₹50 L' },
      { k: 'Govt. Service — Class II', b: 56, band: 'below ₹15 L' },
      { k: 'Salaried — Private', b: 52, band: 'below ₹15 L' },
      { k: 'Contractor', b: 76, band: '₹15 L – ₹50 L' },
      { k: 'Retired', b: 44, band: 'below ₹15 L' },
      { k: 'NRI — Gulf', b: 80, band: '₹50 L – ₹1 Cr' },
      { k: 'Agriculture / Land', b: 72, band: '₹15 L – ₹50 L' },
      { k: 'Housewife', b: 48, band: 'below ₹15 L' },
    ],
  },
  communities: {
    type: [String],
    default: ['Agrawal Samaj', 'Jain Samaj', 'Brahmin', 'Rajput', 'Kayastha', 'Sindhi', 'Punjabi', 'Maheshwari'],
  },
  relations: { type: [String], default: ['Spouse', 'Parent', 'Sibling', 'Child'] },
  propertyTypes: { type: [String], default: ['Villa', 'Plot', 'Flat'] },
  flatConfigs: { type: [String], default: ['1RK', '1BHK', '2BHK', '3BHK', '4BHK'] },
  villaConfigs: { type: [String], default: ['2BHK', '3BHK', '4BHK'] },
  callOutcomes: {
    type: [String],
    default: ['Interested — follow up', 'Not interested', 'No answer', 'Call back later', 'Converted — re-invested'],
  },
  /* which documents the Document Vault checklist (see docsFor() in the
     frontend's derived.js) offers per unit, keyed by that unit's own
     top-level property type ('Villa'/'Plot'/'Flat', from the picker
     UnitFinancialsModal builds — see topPropertyType() in the
     frontend's core.js) plus an 'Other' fallback for anything else.
     Purely a frontend concern — nothing on the backend validates an
     uploaded document's `key` against this list (see the documents
     routes below), so renaming/removing an entry here never touches
     files already on file, only what the checklist offers next. */
  documentTemplates: {
    type: Map,
    of: [String],
    default: {
      Villa: ['Application', 'Sale Deed', 'Sale Agreement', 'Possession Letter'],
      Flat: ['Application', 'Sale Deed', 'Sale Agreement', 'Possession Letter'],
      Plot: ['Application', 'Sale Deed', 'Sale Agreement'],
      Other: ['Application', 'Sale Deed', 'Sale Agreement'],
    },
  },
}, {
  toJSON: {
    transform: (_doc, ret) => { delete ret.__v; return ret; },
  },
});

export default mongoose.model('Settings', SettingsSchema);
