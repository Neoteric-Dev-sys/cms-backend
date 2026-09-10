import mongoose from 'mongoose';

const { Schema } = mongoose;

/* A role is now a row, not a line of code. What each role is *allowed*
   to do is still drawn from the fixed capability catalogue in
   lib/permissions.js — those fifteen labels are wired into
   requirePermission() calls on real routes, so a capability invented
   from the UI would enforce nothing. Roles are data; capabilities are
   code. See lib/roleStore.js for the seed and the read cache. */
const RoleSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  /* capability label -> 'F' | 'S' | 'O' | 'N'. A label absent from the
     map reads as 'N', so adding a new capability to the catalogue
     grants it to nobody until someone deliberately opens it up.
     Plain Object, not a Map — replaced wholesale, never deep-mutated. */
  permissions: { type: Object, default: {} },
  description: { type: String, default: '' },
  /* the bootstrap administrator role. Cannot be renamed, deleted, or
     stripped of user management — without it there is no way back into
     this screen once the last account holding it is gone. */
  system: { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      ret.id = doc._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  },
});

export default mongoose.model('Role', RoleSchema);
