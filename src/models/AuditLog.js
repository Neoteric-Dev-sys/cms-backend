import mongoose from 'mongoose';

const { Schema } = mongoose;

/* One row per state-changing request the API ever handled — written by
   lib/auditLog.js's auditRoute() middleware, mounted alongside
   requireAuth on every resource router in index.js, so nothing here is
   hand-instrumented per endpoint. GETs are read-only and deliberately
   not logged (see auditRoute's own comment). */
const AuditLogSchema = new Schema({
  at: { type: Date, default: Date.now },
  resource: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  params: { type: Schema.Types.Mixed, default: {} },
  /* the request body, with password-shaped fields redacted — see
     lib/auditLog.js's sanitize(). Not a diff against the prior state:
     that would mean reading each model's pre-write document on every
     mutating route, which no route here does today. What was SENT is
     still the load-bearing fact for "who tried to do what". */
  body: { type: Schema.Types.Mixed, default: {} },
  statusCode: { type: Number, required: true },
  ok: { type: Boolean, required: true },
  actor: {
    id: { type: String, default: null },
    name: { type: String, default: null },
    email: { type: String, default: null },
    role: { type: String, default: null },
  },
  ip: { type: String, default: null },
}, {
  toJSON: {
    transform: (doc, ret) => {
      ret.id = doc._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

/* the two shapes the viewer actually queries by — newest first overall,
   or newest first for one actor */
AuditLogSchema.index({ at: -1 });
AuditLogSchema.index({ 'actor.id': 1, at: -1 });

export default mongoose.model('AuditLog', AuditLogSchema);
