/* Full import: the database was just cleared entirely — this loads
   every owner in the source file (E:/temp/neoteric-customers-garden-
   city.json) back in as a shell record, using the exact same builder
   as addNewRecordsFromFile.js (entity/type/loan/val defaults from the
   project, `anniversary` mapped to `spouseDob` since no code in this
   app ever reads a field by that name, occupation written directly
   rather than through the OCC-enum-only validateProfilePatch so
   free-text values like "private Job" aren't silently dropped to "Not
   captured"). Original ids are preserved so this is byte-for-byte the
   same base that was here before the reset.

   Defaults to a DRY RUN:
     node importAllFromFile.js          # report only
     node importAllFromFile.js --apply  # perform the import */
import 'dotenv/config';
import fs from 'fs';
import { connectDB } from './src/db.js';
import Customer from './src/models/Customer.js';
import Counter from './src/models/Counter.js';
import { TODAY, projByName } from './src/lib/core.js';
import { computeIncomplete } from './src/lib/validateIncomplete.js';

const SOURCE_FILE = 'E:/temp/neoteric-customers-garden-city.json';
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
    bookDate: u.bookDate ? new Date(u.bookDate) : null, agrDate: null, regDate: null, possDate: null,
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
    mobile: f.mobile || '', email: null,
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

  const existingCount = await Customer.countDocuments();
  /* mobile is required (it's the app's secondary dedupe key, and the
     shell-import path enforces it too) — a record with none is held
     out rather than seeded with a fake number, same "reject, don't
     guess" rule the rest of this app follows. */
  const noMobile = source.filter((f) => !f.mobile);
  const importable = source.filter((f) => f.mobile);
  const docs = importable.map(buildShellFromFileRecord);
  const maxId = Math.max(...source.map((f) => parseInt(f.id.replace('NEO-C-', ''), 10)));

  console.log(`Source file: ${source.length} records. Database currently has: ${existingCount}.`);
  if (noMobile.length) {
    console.log(`${noMobile.length} record(s) have no mobile number and will be HELD, not imported:`);
    noMobile.forEach((f) => console.log(`  ${f.id} ${f.name}`));
  }
  console.log(`Will insert ${docs.length} record(s).`);
  console.log(`Counter will be set to ${maxId} so the next new customer continues at NEO-C-${maxId + 1}.`);

  if (existingCount > 0) {
    console.log(`\nWARNING: database is not empty (${existingCount} existing records). This script does not delete anything — re-running with --apply on a non-empty collection will fail on duplicate ids for any that already exist.`);
  }

  if (!APPLY) {
    console.log('\nDry run only — no changes made. Re-run with --apply to perform the import.');
    process.exit(0);
  }

  console.log('\nInserting...');
  await Customer.insertMany(docs);
  console.log(`Inserted ${docs.length} document(s).`);

  await Counter.findOneAndUpdate(
    { name: 'customerSeq' },
    { $set: { seq: maxId } },
    { upsert: true }
  );
  console.log(`Customer id counter set to ${maxId}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
