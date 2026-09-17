/* Loads the Settings singleton's master-data lists (projects,
   occupations, communities, relations, property types, flat/villa
   configs, call outcomes) into the synchronous cache validate.js and
   validateOps.js read from (core.js's PROJECTS/OCC/COMM/etc.) — same
   "DB row → in-memory cache" shape as roleStore.js already uses for
   roles/permissions, and for the same reason: those validators run
   inside a synchronous request handler with no business awaiting a
   DB round trip of their own. */
import Settings from '../models/Settings.js';
import { setMasterData } from './core.js';

/* Called on boot and after every master-data write (see routes/
   settings.js) — a project rename or a new occupation option has to
   take effect on the very next request, not at the next restart. */
export async function refreshMasterData() {
  const settings = await Settings.findOne({ _id: 'singleton' }).lean();
  setMasterData(settings);
  return settings;
}
