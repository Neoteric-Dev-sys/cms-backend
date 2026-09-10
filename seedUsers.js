/* One-shot idempotent seed: creates one demo user per role (upsert by
   email) so every tier of the ROLES/PERMS matrix is immediately
   testable. Shared demo password — change it before this ever goes
   anywhere near real users. */
import 'dotenv/config';
import { connectDB } from './src/db.js';
import User from './src/models/User.js';
import { hashPassword } from './src/lib/auth.js';
import { ROLES } from './src/lib/permissions.js';

const DEMO_PASSWORD = 'Demo@123';

const slug = (role) => role.toLowerCase().replace(/[^a-z]+/g, '');

async function seedUsers() {
  await connectDB();

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const rows = [];

  for (const role of ROLES) {
    const email = `${slug(role)}@neoteric.test`;
    await User.findOneAndUpdate(
      { email },
      { email, passwordHash, name: role, role, active: true },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    rows.push({ role, email });
  }

  console.log(`Seeded ${rows.length} demo users (password for all: ${DEMO_PASSWORD}):\n`);
  rows.forEach(({ role, email }) => console.log(`  ${role.padEnd(16)} ${email}`));

  process.exit(0);
}

seedUsers().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
