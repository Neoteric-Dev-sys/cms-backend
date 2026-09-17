import 'dotenv/config';
import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { Server as SocketIOServer } from 'socket.io';
import { connectDB } from './db.js';
import authRouter from './routes/auth.js';
import customersRouter from './routes/customers.js';
import usersRouter from './routes/users.js';
import rolesRouter from './routes/roles.js';
import settingsRouter from './routes/settings.js';
import Customer from './models/Customer.js';
import Settings from './models/Settings.js';
import { requireAuth, requirePermission } from './lib/auth.js';
import { seedRoles, refreshRoles } from './lib/roleStore.js';
import { refreshMasterData } from './lib/masterDataStore.js';
import { MANAGE_USERS } from './lib/permissions.js';

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const app = express();
/* pure JSON API, no HTML/static assets served from here — the default
   CSP (meant for pages that load scripts/styles) is unused overhead
   for a fetch-only backend, so it's the one directive turned off */
app.use(helmet({ contentSecurityPolicy: false }));
/* credentials:true + a specific origin (not '*') is required for the
   httpOnly auth cookie to actually be sent/accepted cross-origin */
app.use(cors({ origin: FRONTEND_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/customers', requireAuth, customersRouter);
app.use('/api/users', requireAuth, requirePermission(MANAGE_USERS), usersRouter);
/* only requireAuth here — the role list itself is readable by anyone
   signed in (it drives the governance matrix and every role picker);
   each write route below carries its own permission check. */
app.use('/api/roles', requireAuth, rolesRouter);
/* same shape as /api/roles — readable by anyone signed in (the
   Portfolio Statement's letterhead needs it), writable only by
   requirePermission(MANAGE_USERS) inside the router itself. */
app.use('/api/settings', requireAuth, settingsRouter);

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  /* multer (file upload) rejections are user-facing validation errors,
     not server faults — surface them as a normal field error instead
     of a generic 500 */
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ errors: { file: 'File is too large — max 10MB.' } });
  if (err.message === 'UNSUPPORTED_FILE_TYPE') return res.status(400).json({ errors: { file: 'Only PDF, JPG or PNG files are allowed.' } });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: FRONTEND_ORIGIN, credentials: true } });

connectDB()
  .then(async () => {
    /* roles must be in the permission cache before the first request is
       served — every requirePermission() check reads it, and an empty
       cache denies everything (see roleLevel in permissions.js) */
    const { seeded } = await seedRoles();
    if (seeded) console.log(`Seeded ${seeded} roles from the access matrix`);
    await refreshRoles();

    /* same reasoning as roles above — projByName()/OCC/COMM/etc. in
       core.js must reflect the real Settings document (or its schema
       defaults, for a fresh database) before the first request, not
       whatever was hardcoded into core.js at the time it was written. */
    await refreshMasterData();

    /* MongoDB Change Streams require a replica set — Atlas clusters
       (and any local `rs.initiate()`'d instance) qualify. Any write to
       the customers collection — from this API, a seed run, or someone
       editing directly in Compass — pushes a live event to every
       connected browser tab. */
    const changeStream = Customer.watch();
    changeStream.on('change', (change) => {
      io.emit('customers:changed', { operationType: change.operationType });
    });
    changeStream.on('error', (err) => {
      console.error('Change stream error:', err.message);
    });

    /* same live-sync pattern as Customer above — the Portfolio
       Statement letterhead (and anywhere else Settings is read) is
       shared, mutable state with no per-user scope, so a change from
       one signed-in tab (or a direct DB edit) should reach every other
       open tab without a manual refresh. */
    const settingsChangeStream = Settings.watch();
    settingsChangeStream.on('change', () => {
      io.emit('settings:changed', {});
    });
    settingsChangeStream.on('error', (err) => {
      console.error('Settings change stream error:', err.message);
    });

    io.on('connection', (socket) => {
      console.log('Realtime client connected:', socket.id);
    });

    const server = httpServer.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));

    /* release the port and the DB connection promptly on shutdown —
       without this, nodemon's restart-on-change (and `rs`) can race
       the old process's teardown and hit EADDRINUSE on the new one */
    const shutdown = () => {
      changeStream.close().catch(() => {});
      settingsChangeStream.close().catch(() => {});
      server.close(() => {
        mongoose.connection.close(false).then(() => process.exit(0));
      });
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
    process.once('SIGUSR2', shutdown); // nodemon's restart signal
  })
  .catch((err) => {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(1);
  });
