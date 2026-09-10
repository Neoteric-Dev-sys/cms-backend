/* Server-side port of the contact gate from the frontend's
   src/lib/derived.js. Uses this backend's own copy of core.js (see
   backend/src/lib/core.js — kept in sync with the frontend's copy so
   "is this owner blocked" never disagrees between client and server). */
import { daysTo, VAL_STALE_DAYS } from './core.js';

export const GATE_ORDER = [
  ['OWNER_EXITED', 'Owner has exited', (c) => c.status === 'EXITED'],
  ['TRANSFER_IN_PROGRESS', 'Transfer or succession in progress', (c) => c.status === 'TRANSFER_IN_PROGRESS' || c.status === 'DECEASED'],
  ['LITIGATION', 'Litigation flag', (c) => c.litigation],
  ['OPEN_COMPLAINT', 'Open service complaint', (c) => c.openComplaints.length > 0],
  ['NO_MARKETING_CONSENT', 'No marketing consent under DPDP', (c) => !c.consent.marketing],
  ['STALE_VALUATION', 'Valuation note out of date',
    (c) => c.units.some((u) => !u.exited && daysTo(u.val.notedOn) < -VAL_STALE_DAYS)],
];

export function gate(c) {
  for (const [code, label, test] of GATE_ORDER) {
    if (test(c)) return { open: false, code, label };
  }
  return { open: true, code: 'OPEN', label: 'No block' };
}
