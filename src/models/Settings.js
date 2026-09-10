import mongoose from 'mongoose';

const { Schema } = mongoose;

/* One document, always the same _id ('singleton'), holding the system
   config that used to be hardcoded into whatever page needed it first
   — starting with the Portfolio Statement's letterhead (company name,
   registered office, CIN, GSTIN). A Super Admin edits this from User
   Management's Settings tab; every other screen just reads it. */
const SettingsSchema = new Schema({
  _id: { type: String, default: 'singleton' },
  companyName: { type: String, default: 'Neoteric Properties Private Limited' },
  groupLine: { type: String, default: 'A Neoteric Group Company · Navayan Realty · Heaven Heights' },
  regdOffice: { type: String, default: '4th Floor, Neoteric Towers, City Centre, Gwalior – 474011, Madhya Pradesh' },
  cin: { type: String, default: 'U70200MP2014PTC034521' },
  gstin: { type: String, default: '23AAFCN1234M1Z5' },
}, {
  toJSON: {
    transform: (_doc, ret) => { delete ret.__v; return ret; },
  },
});

export default mongoose.model('Settings', SettingsSchema);
