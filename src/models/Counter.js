import mongoose from 'mongoose';

const { Schema } = mongoose;

/* Singleton doc per counter name, incremented atomically so concurrent
   creates never hand out the same NEO-C-#### id. */
const CounterSchema = new Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', CounterSchema);

export async function nextCustomerId() {
  const doc = await Counter.findOneAndUpdate(
    { name: 'customerSeq' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return 'NEO-C-' + doc.seq;
}

export default Counter;
