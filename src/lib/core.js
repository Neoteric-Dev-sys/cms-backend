/* =====================================================================
   CORE — clock, seeded RNG, formatters, reference tables.
   Swap generateBase() in generator.js for a fetch() against your own
   API; nothing in the view layer needs to change.
   ===================================================================== */

/* Live local midnight, not a fixed prototype date — this used to be
   hardcoded to a fictional "as of" date (new Date(2026, 7, 10)) so a
   demo's day-counts stayed stable no matter when it was opened. Now
   that the app runs on real, live customer data, a frozen clock
   silently drifts from reality (e.g. a birthday landing on the real
   TODAY read as "in 25 days" because the app's own idea of today was
   weeks behind) — so TODAY tracks the real calendar again. Recomputed
   once per process/page-load (module-level constant, not a function),
   so a long-running server or an open browser tab will still drift
   until its next restart/reload — acceptable since both happen
   regularly, and converting every TODAY reference into a live
   function call is a much larger change than this fix calls for. */
const _now = new Date();
export const TODAY = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
/* TODAY as its own UTC-midnight instant — a date-only form value like
   "2026-08-10" parses as UTC midnight (ECMAScript spec), while TODAY
   itself is local midnight. In any timezone ahead of UTC (e.g. IST)
   comparing the two as raw instants makes entering today's own date
   register as "in the future". Use this for any "not after today"
   check against a date-only input instead of comparing to TODAY
   directly. */
export const TODAY_UTC_MIDNIGHT = Date.UTC(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate());

/* ---- deterministic PRNG so the sample base is identical every load ---- */
let seed = 20260810;
export const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
export const pick = (a) => a[Math.floor(rnd() * a.length)];
export const ib = (a, b) => Math.floor(a + rnd() * (b - a + 1));
export const bt = (a, b) => a + rnd() * (b - a);

/* ---- dates ---- */
export const D = (s) => (s instanceof Date ? s : new Date(s));
export const fmtD = (d) =>
  d ? D(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null;
export const fmtDM = (d) =>
  d ? D(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : null;
export const addD = (d, n) => { const x = new Date(D(d)); x.setDate(x.getDate() + n); return x; };
export const daysTo = (d) => Math.round((D(d) - TODAY) / 86400000);
export const yrs = (a, b) => (D(b) - D(a)) / 31557600000;
export const annivIn = (d) => {
  if (!d) return null;
  const s = D(d);
  const n = new Date(TODAY.getFullYear(), s.getMonth(), s.getDate());
  if (n < TODAY) n.setFullYear(TODAY.getFullYear() + 1);
  return Math.round((n - TODAY) / 86400000);
};

/* ---- money ---- */
export const inr = (n) =>
  n >= 10000000 ? '₹' + (n / 10000000).toFixed(2) + ' Cr'
  : n >= 100000 ? '₹' + (n / 100000).toFixed(2) + ' L'
  : '₹' + Math.round(n).toLocaleString('en-IN');
export const inrF = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
export const cr = (n) => n / 10000000;
export const psf = (n) => '₹' + Number(n).toLocaleString('en-IN');

export const initials = (n) =>
  n.replace(/^(Dr|Mr|Mrs|Ms|Smt|Shri)\.?\s+/i, '').split(' ').slice(0, 2).map((x) => x[0]).join('');

/* ---- valuation register: one signed note per project per month ---- */
/* Owner classification and per-unit occupancy — the Investor tab's two
   captured fields. Mirrored in the frontend's constants/segments.js so
   both ends agree on the stored values; anything outside these sets is
   coerced to null ("not captured") rather than rejected. */
export const OWNER_TYPES = ['INVESTOR', 'END_USER'];
export const OCCUPANCIES = ['SELF_OCCUPIED', 'RENTED', 'VACANT'];

export const VAL_STALE_DAYS = 90;
/* Master data — seeded here so the app has something to run against
   before a Settings document exists, but the arrays themselves are
   mutated in place (never reassigned) by setMasterData() below once
   lib/masterDataStore.js loads the real Settings singleton on boot and
   after every master-data write. Every consumer (projByName, the
   OCC/COMM/etc. exports, and every file that imports them) reads the
   SAME array reference for the life of the process, so a mutation
   here is visible everywhere immediately — no re-import, no restart. */
export const PROJECTS = [
  { code: 'GC', name: 'Garden City', entity: 'Neoteric Properties', launch: 2019, lr: 1850, ask: 7200, resale: 6450, circle: 4100, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '6 registered resales, Towers A–C, Apr–Jun 2026' },
  { code: 'RG', name: 'Regal Garden', entity: 'Neoteric Properties', launch: 2021, lr: 2000, ask: 6900, resale: 6100, circle: 3900, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '5 registered resales, Tower A, Apr–Jun 2026' },
  { code: 'ED', name: 'Eden Garden', entity: 'Neoteric Properties', launch: 2020, lr: 1950, ask: 6800, resale: 5980, circle: 3800, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '3 registered resales, Block C, May–Jun 2026' },
  { code: 'WS', name: 'Westage', entity: 'Neoteric Properties', launch: 2021, lr: 2100, ask: 6700, resale: 5900, circle: 3800, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '3 registered resales, May–Jun 2026' },
  { code: 'NP', name: 'Nature Park', entity: 'Navayan Realty', launch: 2022, lr: 2350, ask: 6200, resale: 5450, circle: 3600, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '4 registered resales, Block A, May–Jun 2026' },
  { code: 'ZG', name: 'Zen Garden', entity: 'Navayan Realty', launch: 2023, lr: 2800, ask: 5900, resale: 5150, circle: 3400, noted: '2026-06-30', by: 'Finance — Head of Accounts', basis: '2 registered resales, Jun 2026' },
  { code: 'WT', name: 'Wildflower Township', entity: 'Navayan Realty', launch: 2024, lr: 3200, ask: 5400, resale: 4700, circle: 3200, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: 'circle rate only — no resale yet' },
  { code: 'HP', name: 'Hyde Park', entity: 'Heaven Heights', launch: 2022, lr: 2600, ask: 6400, resale: 5600, circle: 3700, noted: '2026-07-31', by: 'Finance — Head of Accounts', basis: '3 registered resales, Apr–Jun 2026' },
  { code: 'TS', name: 'The Statement', entity: 'Heaven Heights', launch: 2023, lr: 3400, ask: 6600, resale: 5800, circle: 3900, noted: '2026-03-31', by: 'Finance — Head of Accounts', basis: '1 registered resale, Feb 2026 — thin evidence' },
];
export const projByName = (n) => PROJECTS.find((p) => p.name === n);
export const ENTITIES = [...new Set(PROJECTS.map((p) => p.entity))];
export const RELATIONS = ['Spouse', 'Parent', 'Sibling', 'Child'];
export const PROPERTY_TYPES = ['Villa', 'Plot', 'Flat'];
export const FLAT_CONFIGS = ['1RK', '1BHK', '2BHK', '3BHK', '4BHK'];
export const VILLA_CONFIGS = ['2BHK', '3BHK', '4BHK'];
export const CALL_OUTCOMES = ['Interested — follow up', 'Not interested', 'No answer', 'Call back later', 'Converted — re-invested'];

/* the single source of truth for whether a customer is still a
   "shell"/incomplete record — always recomputed from the actual
   fields, never trusted from a client-supplied flag, and used by
   BOTH the strict create path (validate.js) and the shell/incomplete
   path (validateIncomplete.js) so a record's completeness never
   depends on which endpoint happened to create it. Shared here
   rather than living in either validate file to avoid a circular
   import between the two. */
export function computeIncomplete(pan, unit) {
  if (!pan) return true;
  if (!unit) return true;
  if (!(unit.saleable > 0)) return true;
  if (!(unit.rate > 0)) return true;
  if (!(unit.consideration > 0)) return true;
  if (!unit.bookDate) return true;
  return false;
}

/* Same-person identity match for the "is this owner already on file"
   check at create time — an owner can genuinely book more than one
   unit on more than one occasion, and each booking used to become its
   own separate Customer document instead of another entry in one
   owner's `units[]`. Name alone isn't safe (a small fixed name pool
   makes two different people sharing a name a real possibility, see
   the dedupe script this mirrors) — name AND the same mobile number
   together is. */
export function normName(n) {
  return String(n || '').trim().toLowerCase().replace(/^(dr|mr|mrs|ms|smt|shri)\.?\s+/, '');
}
export function normMobile(m) {
  return String(m || '').replace(/\D/g, '').slice(-10);
}

/* ---- sample-data vocabulary ---- */
export const F = ['Rahul', 'Anil', 'Sunita', 'Deepak', 'Manish', 'Pooja', 'Vikram', 'Neha', 'Rajesh', 'Kavita', 'Sandeep', 'Rekha', 'Amit', 'Shalini', 'Praveen', 'Mamta', 'Ashok', 'Jyoti', 'Nitin', 'Archana', 'Sanjay', 'Ritu', 'Gaurav', 'Seema', 'Harish', 'Divya', 'Mukesh', 'Anjali', 'Ravi', 'Preeti', 'Yogesh', 'Swati', 'Alok', 'Nidhi', 'Brijesh', 'Meena', 'Sachin', 'Vandana', 'Dinesh', 'Sarita', 'Kailash', 'Bhavna', 'Naresh', 'Suman'];
export const L = ['Sharma', 'Gupta', 'Agrawal', 'Jain', 'Tiwari', 'Verma', 'Yadav', 'Singh', 'Shrivastava', 'Rathore', 'Khandelwal', 'Saxena', 'Dubey', 'Mishra', 'Chouhan', 'Pandey', 'Bansal', 'Goyal', 'Sengar', 'Bhargava'];
export const OCC = [
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
];
export const CITY = ['Gwalior', 'Gwalior', 'Gwalior', 'Gwalior', 'Morar', 'Thatipur', 'Dabra', 'Shivpuri', 'Jhansi', 'Bhind', 'Datia', 'Delhi NCR', 'Indore', 'Dubai'];
export const COMM = ['Agrawal Samaj', 'Jain Samaj', 'Brahmin', 'Rajput', 'Kayastha', 'Sindhi', 'Punjabi', 'Maheshwari'];
export const SRC = ['Direct walk-in', 'DSA — Aarambh partner', 'Digital lead', 'Customer referral', 'Customer referral', 'Broker', 'Hoarding / print'];
export const CTXT = ['Seepage — master bathroom wall', 'Lift AMC response delay', 'Parking allotment dispute', 'Society maintenance billing', 'Registry documents pending', 'Tile hollowness in bedroom', 'Water pressure on upper floor', 'Possession date slippage'];

/* Replaces the CONTENTS of every master-data array above with what's
   in the Settings document — .length = 0 then push, never `PROJECTS =
   something`, so every module that imported PROJECTS keeps pointing
   at the one array whose contents just changed, the same array-
   mutation trick every file's projByName()/OCC.find()/etc. already
   relies on implicitly. Only touches a list when the settings doc
   actually has it (non-empty), so a partial/older document can't wipe
   the rest back to empty. */
function replace(arr, next) {
  if (!Array.isArray(next) || !next.length) return;
  arr.length = 0;
  arr.push(...next);
}
export function setMasterData(s) {
  if (!s) return;
  replace(PROJECTS, s.projects);
  replace(ENTITIES, [...new Set(PROJECTS.map((p) => p.entity))]);
  replace(OCC, s.occupations);
  replace(COMM, s.communities);
  replace(RELATIONS, s.relations);
  replace(PROPERTY_TYPES, s.propertyTypes);
  replace(FLAT_CONFIGS, s.flatConfigs);
  replace(VILLA_CONFIGS, s.villaConfigs);
  replace(CALL_OUTCOMES, s.callOutcomes);
}

export const FEST = [
  { n: 'Navratri / Dussehra', s: new Date(2026, 9, 11) },
  { n: 'Dhanteras / Diwali', s: new Date(2026, 10, 5) },
  { n: 'Akshaya Tritiya', s: new Date(2027, 3, 18) },
  { n: 'Gudi Padwa', s: new Date(2027, 2, 18) },
];
export const nextFest = () => {
  const f = FEST.filter((x) => x.s >= TODAY).sort((a, b) => a.s - b.s)[0];
  return f ? { ...f, days: daysTo(f.s) } : null;
};
