/* One-shot idempotent seed: populates MongoDB with the exact same
   deterministic sample dataset the frontend used to generate in-memory
   (this backend's own copy of generator.js/core.js — kept identical to
   frontend/src/lib/ so the sample data matches record for record), then
   advances the id counter so real creates continue after NEO-C-1240.
   Safe to re-run. */
import 'dotenv/config';
import { connectDB } from './src/db.js';
import Customer from './src/models/Customer.js';
import Project from './src/models/Project.js';
import Counter from './src/models/Counter.js';
import { generateBase } from './src/lib/generator.js';
import { PROJECTS } from './src/lib/core.js';

async function seed() {
  await connectDB();

  await Customer.deleteMany({});
  await Project.deleteMany({});

  await Project.insertMany(PROJECTS);
  console.log(`Seeded ${PROJECTS.length} projects.`);

  const base = generateBase(240);
  await Customer.insertMany(base);
  console.log(`Seeded ${base.length} customers.`);

  await Counter.findOneAndUpdate(
    { name: 'customerSeq' },
    { $set: { seq: 1240 } },
    { upsert: true }
  );
  console.log('Customer id counter set to continue after NEO-C-1240.');

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
