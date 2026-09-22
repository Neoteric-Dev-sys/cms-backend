import { Router } from 'express';
import Event from '../models/Event.js';
import { requirePermission } from '../lib/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

const MANAGE_EVENTS = 'Manage events and invite lists';
const canManage = requirePermission(MANAGE_EVENTS);

/* Readable by anyone signed in — same reasoning as /api/roles and
   /api/settings: the Customer Master "Invite list" drawer needs the
   event list to populate its picker for any staff member, not just
   whoever can create/edit events. Only the writes below are gated. */
router.get('/', asyncHandler(async (_req, res) => {
  const events = await Event.find().sort({ date: 1 });
  res.json(events);
}));

router.post('/', canManage, asyncHandler(async (req, res) => {
  const body = req.body || {};
  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ errors: { name: 'Event name is required.' } });
  const date = body.date ? new Date(body.date) : null;
  if (!date || Number.isNaN(date.getTime())) return res.status(400).json({ errors: { date: 'A valid date is required.' } });

  const event = await Event.create({
    name,
    date,
    location: String(body.location || '').trim() || null,
    description: String(body.description || '').trim() || null,
    createdBy: req.user.name,
  });
  res.status(201).json(event);
}));

router.patch('/:id', canManage, asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const body = req.body || {};
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ errors: { name: 'Event name is required.' } });
    event.name = name;
  }
  if (body.date !== undefined) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) return res.status(400).json({ errors: { date: 'A valid date is required.' } });
    event.date = date;
  }
  if (body.location !== undefined) event.location = String(body.location || '').trim() || null;
  if (body.description !== undefined) event.description = String(body.description || '').trim() || null;

  await event.save();
  res.json(event);
}));

router.delete('/:id', canManage, asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  await event.deleteOne();
  res.json({ id: req.params.id });
}));

/* idempotent — re-selecting an owner already on the list is a no-op
   rather than a second row, since the invite list is a set of who's
   invited, not a log of every time someone clicked. */
router.post('/:id/invite', canManage, asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });

  const customerId = String(req.body?.customerId || '').trim();
  if (!customerId) return res.status(400).json({ error: 'customerId is required.' });
  if (event.invites.some((i) => i.customerId === customerId)) return res.json(event);

  event.invites.push({
    customerId,
    customerName: String(req.body?.customerName || '').trim(),
    invitedBy: req.user.name,
  });
  await event.save();
  res.json(event);
}));

router.delete('/:id/invite/:customerId', canManage, asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found' });
  event.invites = event.invites.filter((i) => i.customerId !== req.params.customerId);
  await event.save();
  res.json(event);
}));

export default router;
