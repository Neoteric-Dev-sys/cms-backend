import { Router } from 'express';
import User from '../models/User.js';
import { verifyPassword, signToken, setAuthCookie, clearAuthCookie, requireAuth } from '../lib/auth.js';
import { asyncHandler } from '../lib/asyncHandler.js';

const router = Router();

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: { id: user._id.toString(), email: user.email, name: user.name, role: user.role } });
}));

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
