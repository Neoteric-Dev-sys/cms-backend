import { Router } from 'express';
import AuditLog from '../models/AuditLog.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();
const PAGE_SIZE = 50;

/* letters/digits/spaces/@/./_/- only — enough for a name, an email or a
   role, nothing that turns into a regex metacharacter */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Read-only — writes to this collection only ever happen from
   auditRoute() (see lib/auditLog.js), never from a client request.
   Gated on MANAGE_USERS in index.js, same capability as /api/users:
   whoever can create or deactivate an account is the audience for who
   did what. */
router.get('/', asyncHandler(async (req, res) => {
  const { resource, method, ok, actor, from, to, page, recordId } = req.query;

  const filter = {};
  if (resource) filter.resource = resource;
  if (method) filter.method = String(method).toUpperCase();
  if (ok === 'true') filter.ok = true;
  if (ok === 'false') filter.ok = false;
  /* the record's own human-readable id (e.g. a customer's "NEO-C-158"),
     as it appears in the route's own :id param — what Customer
     Master's own Audit log tab filters on to show one owner's history
     instead of the whole system's. */
  if (recordId) filter['params.id'] = recordId;
  if (actor) {
    const needle = new RegExp(escapeRegex(String(actor).trim()), 'i');
    filter.$or = [{ 'actor.name': needle }, { 'actor.email': needle }];
  }
  if (from || to) {
    filter.at = {};
    if (from) filter.at.$gte = new Date(from);
    if (to) filter.at.$lte = new Date(to);
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);

  const [docs, total, resources] = await Promise.all([
    AuditLog.find(filter).sort({ at: -1 }).skip((pageNum - 1) * PAGE_SIZE).limit(PAGE_SIZE),
    AuditLog.countDocuments(filter),
    AuditLog.distinct('resource'),
  ]);

  res.json({
    entries: docs.map((d) => d.toJSON()),
    total,
    page: pageNum,
    pageSize: PAGE_SIZE,
    resources: resources.sort(),
  });
}));

export default router;
