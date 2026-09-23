/* One-off script: logs a receipt for the full outstanding balance on
   every live (non-exited) unit across the whole Owner Base — the
   effect is marking the entire portfolio "fully paid". This was
   requested explicitly and confirmed twice for the real production
   database. It is NOT something to run again without deliberately
   choosing to — receipts are additive (see POST /:id/units/:index/
   receipts in routes/customers.js), so running this twice would double
   every "paid" figure, not just re-confirm it.

   Requires your backend to already be running (defaults to
   http://localhost:3000 — override with the API_BASE env var if
   yours runs elsewhere) and a signed-in admin account.

   Usage (from the backend/ folder):
     node scripts/markAllPaid.js
   or, to point at a different backend / login:
     API_BASE=http://localhost:3000 ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=... node scripts/markAllPaid.js

   This prints exactly what it's about to do, then does it — read the
   summary at the end before trusting it blindly. */

const API_BASE = process.env.API_BASE || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hussain@neotericgrp.in';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Demo@123';

/* Yesterday, in UTC — not "today" in this machine's local timezone.
   The server validates the receipt date isn't in the future using ITS
   OWN clock (see parseDateNotFuture in validateOps.js); for several
   hours around local midnight in any timezone ahead of UTC (IST
   included), "today" here is already "tomorrow" there, so a same-day
   date gets rejected as a future date. A day back is safely in the
   past everywhere, no matter which timezone either side runs in. */
function todayInput() {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function login() {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed: HTTP ${res.status} — check ADMIN_EMAIL/ADMIN_PASSWORD.`);
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) throw new Error('Login succeeded but no session cookie was returned.');
  // Node's fetch may fold multiple Set-Cookie headers into one comma-joined
  // string; each cookie's own value can't contain a comma, so splitting on
  // ", " between cookie pairs (not on "," inside one) is safe here — take
  // just the name=value part of each, before its first ";".
  return setCookie.split(/,(?=[^ ])/).map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  console.log(`Logging in to ${API_BASE} as ${ADMIN_EMAIL}...`);
  const cookie = await login();

  console.log('Fetching every customer...');
  const listRes = await fetch(`${API_BASE}/api/customers`, { headers: { Cookie: cookie } });
  if (!listRes.ok) throw new Error(`Could not fetch customers: HTTP ${listRes.status}`);
  const customers = await listRes.json();
  console.log(`${customers.length} customers on file.`);

  const date = todayInput();
  let unitsCleared = 0, totalAmount = 0, skipped = 0, failed = 0;

  for (const c of customers) {
    for (let idx = 0; idx < c.units.length; idx++) {
      const u = c.units[idx];
      if (u.exited) { skipped++; continue; }
      if (!(u.consideration > 0)) { skipped++; continue; }
      const outstanding = u.consideration - (u.paid || 0);
      if (!(outstanding > 0)) { skipped++; continue; }

      const res = await fetch(`${API_BASE}/api/customers/${c.id}/units/${idx}/receipts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({ unit: u.unit, project: u.project, amount: outstanding, date }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(`  FAILED ${c.id} · ${u.unit || '(no unit number)'} · ${u.project} — ${body.error || JSON.stringify(body.errors) || res.status}`);
        failed++;
        continue;
      }
      unitsCleared++;
      totalAmount += outstanding;
      console.log(`  ${c.id} · ${u.unit || '(no unit number)'} · ${u.project} — cleared ₹${outstanding.toLocaleString('en-IN')}`);
    }
  }

  console.log('\n--- Done ---');
  console.log(`Units cleared to fully paid: ${unitsCleared}`);
  console.log(`Total amount logged as received: ₹${totalAmount.toLocaleString('en-IN')}`);
  console.log(`Units skipped (exited, no consideration, or already fully paid): ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch((err) => {
  console.error('\nScript stopped:', err.message);
  process.exit(1);
});
