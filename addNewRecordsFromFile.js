/* Inserts the 11 owners present in the source file
   (E:/temp/neoteric-customers-garden-city.json) that are not yet in
   the database — ids NEO-C-1510..1520, exactly the next ids the app's
   own counter would hand out (it was sitting at 1509), so these are
   inserted under their real ids rather than re-issued fresh ones.

   Built the same shape buildShellCustomer() produces (entity/type/
   loan/val defaults from the project), but occupation/dob/spouseDob
   are written directly rather than through validateProfilePatch —
   several of these are free-text occupations ("private Job") that
   don't match the fixed OCC enum, which would otherwise silently drop
   to "Not captured" (same reasoning as importProfileDataFromFile.js,
   which already applied this to the existing 230). `anniversary` in
   the file maps to `spouseDob`, the only field this app ever reads.

   Bumps the customerSeq counter to 1520 afterward so the next customer
   created through the app continues at 1521, not 1510.

   Defaults to a DRY RUN:
     node addNewRecordsFromFile.js          # report only
     node addNewRecordsFromFile.js --apply  # insert for real
   Safe to re-run — records already present (matched by id) are skipped. */
import 'dotenv/config';
import fs from 'fs';
import { connectDB } from './src/db.js';
import Customer from './src/models/Customer.js';
import Counter from './src/models/Counter.js';
import { TODAY, projByName } from './src/lib/core.js';
import { computeIncomplete } from './src/lib/validateIncomplete.js';

const SOURCE_FILE = 'E:/temp/neoteric-customers-garden-city.json';
const NEW_IDS = ['NEO-C-1510', 'NEO-C-1511', 'NEO-C-1512', 'NEO-C-1513', 'NEO-C-1514', 'NEO-C-1515', 'NEO-C-1516', 'NEO-C-1517', 'NEO-C-1518', 'NEO-C-1519', 'NEO-C-1520'];
const APPLY = process.argv.includes('--apply');

function buildShellFromFileRecord(f) {
  const u = f.units[0];
  const p = projByName(u.project);
  if (!p) throw new Error(`Unknown project "${u.project}" for ${f.id}`);

  const occupation = f.occupation && f.occupation !== 'Not captured' ? f.occupation : 'Not captured';
  const dob = f.dob ? new Date(f.dob) : null;
  const spouseDob = f.anniversary ? new Date(f.anniversary) : null;
  const unit = {
    unit: u.unit, project: p.name, entity: p.entity, type: '—',
    carpet: null, saleable: null, loading: 32,
    bookDate: null, agrDate: null, regDate: null, possDate: null,
    rate: null, discount: 0, consideration: u.consideration || null, paid: 0,
    receipts: 0, bounced: 0, lastReceipt: null,
    loan: { bank: null, tenure: 0, start: null, closure: null, closed: true, prepaid: false, selfFunded: true },
    val: { ask: p.ask, resale: p.resale, circle: p.circle, notedOn: p.noted, basis: p.basis, by: p.by },
    exited: false,
  };

  return {
    id: f.id, status: 'ACTIVE', statusSince: TODAY, statusNote: null,
    salutation: f.salutation || 'Mr.', name: f.name.trim(),
    coApplicant: null, coRelation: 'Spouse', coOnAgreement: false,
    dob, spouseDob, children: [],
    pan: null, aadhaarHeld: false, kycDate: null,
    mobile: f.mobile, email: null,
    corrAddr: 'Address not updated since booking', city: 'Gwalior',
    occupation, occBand: 50, incomeBand: null, community: 'Other',
    captured: { dob: !!dob, anniv: !!spouseDob, kid: false, occ: occupation !== 'Not captured', addr: false },
    consent: { whatsapp: false, sms: false, email: false, marketing: false, date: null, purpose: null, children: false },
    source: f.source || 'Direct walk-in', referredBy: null,
    units: [unit],
    complaints: [], openComplaints: [], nps: null, npsDate: null, litigation: false,
    referrals: [], events: [], siteVisits: 0, portalLast: null, statements: [],
    documents: [], calls: [],
    incomplete: computeIncomplete(null, unit),
  };
}

async function run() {
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  await connectDB();

  const already = await Customer.collection.find({ id: { $in: NEW_IDS } }, { projection: { id: 1 } }).toArray();
  const alreadyIds = new Set(already.map((d) => d.id));

  const toInsert = NEW_IDS
    .filter((id) => !alreadyIds.has(id))
    .map((id) => source.find((f) => f.id === id))
    .filter(Boolean)
    .map(buildShellFromFileRecord);

  console.log(`${alreadyIds.size} of ${NEW_IDS.length} already exist in the database — skipping those.`);
  console.log(`${toInsert.length} record(s) will be inserted:`);
  toInsert.forEach((c) => console.log(`  ${c.id} — ${c.name} — ${c.units[0].unit} — dob=${c.dob ? c.dob.toISOString().slice(0, 10) : 'none'} spouseDob=${c.spouseDob ? c.spouseDob.toISOString().slice(0, 10) : 'none'} occupation=${c.occupation}`));

  if (!APPLY) {
    console.log('\nDry run only — no changes made. Re-run with --apply to insert these records.');
    process.exit(0);
  }

  if (toInsert.length) {
    await Customer.collection.insertMany(toInsert);
    console.log(`\nInserted ${toInsert.length} document(s).`);
  }

  await Counter.findOneAndUpdate(
    { name: 'customerSeq' },
    [{ $set: { seq: { $max: ['$seq', 1520] } } }],
  );
  console.log('Customer id counter confirmed at >= 1520.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Insert failed:', err);
  process.exit(1);
});
