import mongoose from 'mongoose';

const { Schema } = mongoose;

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  /* validated against the live Role collection at the route, not by a
     schema enum — roles are rows now, and a role added today would
     otherwise be rejected until the next deploy. See validateUsers.js. */
  role: { type: String, required: true },
  active: { type: Boolean, default: true },
  /* profile fields — informational only, nothing in the app reads
     these to decide access or behaviour (role/active are what gate
     anything). Free text, not fixed lists: this is a real-estate CRM
     back office, not a multi-department org chart, so a canned
     dropdown of departments would be inventing structure that
     doesn't exist here. */
  phone: { type: String, default: '' },
  employeeId: { type: String, default: '' },
  designation: { type: String, default: '' },
  department: { type: String, default: '' },
  /* per-user exceptions to the role's PERMS row — keyed by the exact
     capability label, value one of 'F'/'S'/'O'/'N'. Only capabilities
     present here override the role default; everything else still
     comes from the role matrix (see hasPermission in permissions.js).
     Plain Object rather than a Mongoose Map — simpler JSON round-trip,
     and this is always replaced wholesale, never deep-mutated. */
  permissionOverrides: { type: Object, default: {} },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = doc._id.toString();
      delete ret._id;
      delete ret.__v;
      delete ret.passwordHash;
      return ret;
    },
  },
});

export default mongoose.model('User', UserSchema);
