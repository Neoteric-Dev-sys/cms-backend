/* Full reset, requested explicitly and confirmed twice: deletes every
   Customer document and resets the id counter back to 0 so the next
   import starts clean at NEO-C-1. Does not touch Projects or Users. */
import 'dotenv/config';
import { connectDB } from './src/db.js';
import Customer from './src/models/Customer.js';
import Counter from './src/models/Counter.js';

async function run() {
  await connectDB();

  const count = await Customer.countDocuments();
  const res = await Customer.deleteMany({});
  console.log(`Deleted ${res.deletedCount} of ${count} customer document(s).`);

  await Counter.findOneAndUpdate(
    { name: 'customerSeq' },
    { $set: { seq: 0 } },
    { upsert: true }
  );
  console.log('Customer id counter reset to 0.');

  process.exit(0);
}

run().catch((err) => {
  console.error('Clear failed:', err);
  process.exit(1);
});
