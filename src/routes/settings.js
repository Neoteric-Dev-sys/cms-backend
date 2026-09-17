import { Router } from 'express';
import Settings from '../models/Settings.js';
import { requirePermission } from '../lib/auth.js';
import { MANAGE_USERS } from '../lib/permissions.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { refreshMasterData } from '../lib/masterDataStore.js';

const router = Router();

const canManage = requirePermission(MANAGE_USERS);

const TEXT_FIELDS = ['companyName', 'groupLine', 'regdOffice', 'cin', 'gstin'];
/* plain string lists — every dropdown in the app that isn't Projects
   or Occupation (which need their own object shape, validated below)
   reduces to "a set of non-empty labels, at least one of them". */
const STRING_LIST_FIELDS = ['communities', 'relations', 'propertyTypes', 'flatConfigs', 'villaConfigs', 'callOutcomes'];

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

function cleanStringList(list) {
  return [...new Set(list.map((x) => String(x || '').trim()).filter(Boolean))];
}

/* Every write here replaces the WHOLE list for that field — the
   Master Data page always sends the complete, already-edited array
   back (same shape as RolePermissionsModal sending a whole permissions
   map), so there's no separate "add one row"/"remove one row" route
   to keep in sync with this validation. */
function validateProjects(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'Keep at least one project.' };
  const seen = new Set();
  const cleaned = [];
  for (const p of raw) {
    const name = String(p?.name || '').trim();
    const entity = String(p?.entity || '').trim();
    if (!name || !entity) return { error: 'Every project needs a name and an entity.' };
    const key = name.toLowerCase();
    if (seen.has(key)) return { error: `Duplicate project name: "${name}".` };
    seen.add(key);
    cleaned.push({
      code: String(p.code || '').trim() || name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'XX',
      name, entity,
      launch: Number(p.launch) || null,
      lr: Number(p.lr) || null,
      ask: Number(p.ask) || null,
      resale: Number(p.resale) || null,
      circle: Number(p.circle) || null,
      noted: String(p.noted || '').trim() || null,
      by: String(p.by || '').trim() || null,
      basis: String(p.basis || '').trim() || null,
    });
  }
  return { list: cleaned };
}

function validateOccupations(raw) {
  if (!Array.isArray(raw) || !raw.length) return { error: 'Keep at least one occupation.' };
  const seen = new Set();
  const cleaned = [];
  for (const o of raw) {
    const k = String(o?.k || '').trim();
    if (!k) return { error: 'Every occupation needs a label.' };
    const key = k.toLowerCase();
    if (seen.has(key)) return { error: `Duplicate occupation: "${k}".` };
    seen.add(key);
    cleaned.push({ k, b: Math.max(0, Math.min(100, Number(o.b) || 50)), band: String(o.band || '').trim() || null });
  }
  return { list: cleaned };
}

/* one property type's document checklist at a time — the Master Data
   page saves a single type's list via the whole-map merge shape below
   (`{ propertyType, documents }`), not the whole map at once, since
   there's no natural "select all types to edit together" UI and
   requiring the whole map on every save would let one type's stale
   client-side copy silently blank out another's on save. */
function validateDocumentTemplate(body) {
  const propertyType = String(body?.propertyType || '').trim();
  if (!propertyType) return { error: 'Missing property type — reload and try again.' };
  if (!Array.isArray(body?.documents)) return { error: 'Expected a list of documents.' };
  const list = cleanStringList(body.documents);
  if (!list.length) return { error: 'Keep at least one document.' };
  return { propertyType, list };
}

/* Readable by any signed-in user — the company letterhead on a
   Portfolio Statement isn't privileged information, and every dropdown
   fed by the master-data lists is used across the whole app the
   moment anyone signs in. Only the Settings/Master Data pages (Super
   Admin) can change any of it. */
router.get('/', asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  res.json(settings);
}));

router.patch('/', canManage, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const patch = {};
  const errors = {};

  for (const f of TEXT_FIELDS) {
    if (body[f] !== undefined) patch[f] = String(body[f] || '').trim();
  }

  for (const f of STRING_LIST_FIELDS) {
    if (body[f] === undefined) continue;
    if (!Array.isArray(body[f])) { errors[f] = 'Expected a list.'; continue; }
    const list = cleanStringList(body[f]);
    if (!list.length) { errors[f] = 'Keep at least one option.'; continue; }
    patch[f] = list;
  }

  if (body.projects !== undefined) {
    const { list, error } = validateProjects(body.projects);
    if (error) errors.projects = error;
    else patch.projects = list;
  }

  if (body.occupations !== undefined) {
    const { list, error } = validateOccupations(body.occupations);
    if (error) errors.occupations = error;
    else patch.occupations = list;
  }

  /* { documentTemplate: { propertyType, documents } } — one type's
     checklist per save (see validateDocumentTemplate). Writes the
     WHOLE map, never a `documentTemplates.<type>` dot-path: most of
     this map only ever exists as a schema *default*, applied when
     Mongoose hydrates a read, not actually written to the stored
     document — a dot-path $set against a parent that was never
     persisted creates a new object holding only that one key, silently
     dropping every sibling type's list. Reading the resolved map first
     (getSettings() below applies those same defaults) and writing it
     back whole is what actually persists all of it, self-healing the
     document from here on. */
  let documentTemplatesPatch = null;
  if (body.documentTemplate !== undefined) {
    const { propertyType, list, error } = validateDocumentTemplate(body.documentTemplate);
    if (error) errors.documentTemplate = error;
    else documentTemplatesPatch = { propertyType, list };
  }

  if (Object.keys(errors).length) return res.status(400).json({ errors });

  if (documentTemplatesPatch) {
    const current = await getSettings();
    const currentMap = current.documentTemplates instanceof Map
      ? Object.fromEntries(current.documentTemplates)
      : (current.documentTemplates || {});
    patch.documentTemplates = { ...currentMap, [documentTemplatesPatch.propertyType]: documentTemplatesPatch.list };
  }

  const settings = await Settings.findOneAndUpdate(
    { _id: 'singleton' },
    { $set: patch, $setOnInsert: { _id: 'singleton' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  /* every dropdown reads PROJECTS/OCC/COMM/etc. straight off the
     synchronous cache in core.js — has to be refreshed before this
     response even goes out, or the very next request (possibly this
     same admin, clicking straight back to the list) could still see
     the old data. */
  await refreshMasterData();
  res.json(settings);
}));

export default router;
