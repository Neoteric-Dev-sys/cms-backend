import mongoose from 'mongoose';

const { Schema } = mongoose;

/* Who's invited to this event — customerName/By are snapshotted at
   invite time (not populated live off Customer) so the invite list
   still reads correctly even if the owner is later renamed or, in
   the rare case, deleted. */
const InviteSchema = new Schema({
  customerId: { type: String, required: true },
  customerName: { type: String, default: '' },
  invitedAt: { type: Date, default: Date.now },
  invitedBy: { type: String, default: null },
}, { _id: false });

const EventSchema = new Schema({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  location: { type: String, default: null },
  description: { type: String, default: null },
  invites: { type: [InviteSchema], default: [] },
  createdBy: { type: String, default: null },
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

export default mongoose.model('Event', EventSchema);
