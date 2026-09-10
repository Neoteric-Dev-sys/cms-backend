import { Router } from 'express';
import Settings from '../models/Settings.js';
import { requirePermission } from '../lib/auth.js';
import { MANAGE_USERS } from '../lib/permissions.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

const canManage = requirePermission(MANAGE_USERS);

const FIELDS = ['companyName', 'groupLine', 'regdOffice', 'cin', 'gstin'];

/* upsert-on-read: the first request ever made against a fresh database
   creates the singleton from the schema's own defaults, so there's
   never a "no settings yet" state either side of this route has to
   handle specially. */
async function getSettings() {
  return Settings.findOneAndUpdate(
    { _id: 'singleton' },
    { $setOnInsert: { _id: 'singleton' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/* Readable by any signed-in user — the company letterhead on a
   Portfolio Statement isn't privileged information, every owner-facing
   screen needs it. Only the Settings tab (Super Admin) can change it. */
router.get('/', asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
}));

router.patch('/', canManage, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const patch = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) patch[f] = String(body[f] || '').trim();
  }
  const settings = await Settings.findOneAndUpdate(
    { _id: 'singleton' },
    { $set: patch, $setOnInsert: { _id: 'singleton' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  res.json(settings);
}));

export default router;
