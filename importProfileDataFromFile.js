/* One-off fill-in-the-blanks migration: the 230 Garden City owners were
   originally imported as shell records (name/mobile/project/unit only)
   via /api/customers/incomplete. The real profile data — DOB,
   anniversary, occupation — for these same owners lives in a separate
   source file (E:/temp/neoteric-customers-garden-city.json) that was
   never actually applied to the database. That file also uses a field
   named "anniversary", which the app has never used anywhere (the
   Customer schema/UI only ever read/write `spouseDob`), so it's mapped
   here rather than written as-is.

   Matches by `id`. Only ever FILLS a field that is currently empty in
   the database — never overwrites an existing value. `captured` flags
   are recomputed from the resulting real field values, not copied from
   the file (the file's own `captured` object is unreliable — it has
   `anniv: true` in many records whose `spouseDob` is null).

   Defaults to a DRY RUN:
     node importProfileDataFromFile.js          # report only
     node importProfileDataFromFile.js --apply  # write the changes
   Safe to re-run — a second run finds nothing left to fill. */
import 'dotenv/config';
import fs from 'fs';
import { connectDB } from './src/db.js';
import Customer from './src/models/Customer.js';

const SOURCE_FILE = 'E:/temp/neoteric-customers-garden-city.json';
const APPLY = process.argv.includes('--apply');

async function run() {
  const source = JSON.parse(fs.readFileSync(SOURCE_FILE, 'utf8'));
  await connectDB();

  const existing = await Customer.collection
    .find({}, { projection: { id: 1, dob: 1, spouseDob: 1, occupation: 1, captured: 1, units: 1 } })
    .toArray();
  const byId = new Map(existing.map((d) => [d.id, d]));

  const notInDb = source.filter((f) => !byId.has(f.id));
  const ops = [];
  const considerationConflicts = [];
  const stats = { dob: 0, spouseDob: 0, occupation: 0, consideration: 0 };

  for (const f of source) {
    const dbDoc = byId.get(f.id);
    if (!dbDoc) continue;

    const set = {};

    if (!dbDoc.dob && f.dob) {
      set.dob = new Date(f.dob);
      stats.dob++;
    }
    if (!dbDoc.spouseDob && f.anniversary) {
      set.spouseDob = new Date(f.anniversary);
      stats.spouseDob++;
    }
    if ((!dbDoc.occupation || dbDoc.occupation === 'Not captured') && f.occupation && f.occupation !== 'Not captured') {
      set.occupation = f.occupation;
      stats.occupation++;
    }

    const dbUnit = dbDoc.units && dbDoc.units[0];
    const fUnit = f.units && f.units[0];
    if (dbUnit && fUnit && fUnit.consideration) {
      if (!dbUnit.consideration) {
        set['units.0.consideration'] = fUnit.consideration;
        stats.consideration++;
      } else if (dbUnit.consideration !== fUnit.consideration) {
        considerationConflicts.push({ id: f.id, db: dbUnit.consideration, file: fUnit.consideration });
      }
    }

    if (Object.keys(set).length === 0) continue;

    set['captured.dob'] = !!(set.dob || dbDoc.dob);
    set['captured.anniv'] = !!(set.spouseDob || dbDoc.spouseDob);
    set['captured.occ'] = !!(set.occupation || (dbDoc.occupation && dbDoc.occupation !== 'Not captured'));

    ops.push({ updateOne: { filter: { id: f.id }, update: { $set: set } } });
  }

  console.log(`Source file: ${source.length} records. Database: ${existing.length} records.`);
  console.log(`${notInDb.length} record(s) in the file are NOT in the database (not created by this script): ${notInDb.map((d) => d.id).join(', ')}`);
  console.log();
  console.log(`Will fill: dob x${stats.dob}, spouseDob x${stats.spouseDob}, occupation x${stats.occupation}, unit consideration x${stats.consideration}`);
  console.log(`Total documents touched: ${ops.length}`);
  console.log();

  if (considerationConflicts.length) {
    console.log(`${considerationConflicts.length} consideration conflict(s) — DB already has a DIFFERENT value, left untouched:`);
    considerationConflicts.forEach((c) => console.log(`  ${c.id}: db=${c.db} file=${c.file}`));
    console.log();
  }

  if (!APPLY) {
    console.log('Dry run only — no changes made. Re-run with --apply to write these changes.');
    process.exit(0);
  }

  console.log('Applying...');
  const res = await Customer.collection.bulkWrite(ops);
  console.log(`Updated ${res.modifiedCount} document(s).`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
