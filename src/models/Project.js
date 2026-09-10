import mongoose from 'mongoose';

const { Schema } = mongoose;

/* Mirrors the PROJECTS array in src/lib/core.js */
const ProjectSchema = new Schema({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  entity: { type: String, required: true },
  launch: Number,
  lr: Number,
  ask: Number,
  resale: Number,
  circle: Number,
  noted: String,
  by: String,
  basis: String,
}, {
  toJSON: {
    transform: (_doc, ret) => { delete ret._id; delete ret.__v; return ret; },
  },
});

export default mongoose.model('Project', ProjectSchema);
