import 'dotenv/config';
import mongoose from 'mongoose';
import Customer from './src/models/Customer.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/neoteric-connect';

const PROMOTER_REASONS = [
  'Timely possession & superior construction quality',
  'Smooth loan processing & helpful CRM team',
  'Transparent dealing & excellent capital appreciation',
  'Great amenities & well-maintained clubhouse',
  'Hassle-free registry documentation & prompt updates',
];

const PASSIVE_REASONS = [
  'Decent construction quality, minor possession delay',
  'Good property location, but parking availability is tight',
  'Satisfactory overall experience, room for maintenance improvement',
  'Average CRM communication speed during booking',
];

const DETRACTOR_REASONS = [
  'Water seepage & construction quality issues on site',
  'Delayed registry documentation & unfulfilled promises',
  'Unresponsive CRM support regarding complaint resolution',
  'Significant delay in possession timeline',
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.');

  const customers = await Customer.find({});
  console.log(`Found ${customers.length} total customers.`);

  let updatedCount = 0;
  for (const c of customers) {
    const hasComplaint = c.openComplaints && c.openComplaints.length > 0;
    let score;
    let reason;

    if (hasComplaint) {
      score = Math.floor(Math.random() * 5) + 2; // 2..6
      reason = pick(DETRACTOR_REASONS);
    } else {
      score = Math.random() < 0.65 ? (Math.random() < 0.5 ? 9 : 10) : (Math.random() < 0.5 ? 7 : 8);
      if (score >= 9) reason = pick(PROMOTER_REASONS);
      else if (score >= 7) reason = pick(PASSIVE_REASONS);
      else reason = pick(DETRACTOR_REASONS);
    }

    const daysAgo = Math.floor(Math.random() * 300) + 15;
    const npsDate = new Date(Date.now() - daysAgo * 86400000);

    c.nps = score;
    c.npsDate = npsDate;
    c.npsReason = reason;
    await c.save();
    updatedCount++;
  }

  console.log(`Successfully populated NPS scores and Reasons for ${updatedCount} customers!`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Error populating NPS:', err);
  process.exit(1);
});
