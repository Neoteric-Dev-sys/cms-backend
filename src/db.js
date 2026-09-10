import mongoose from 'mongoose';

/* Never log the raw URI — it carries credentials. Log only the host,
   which is all that's useful for confirming which cluster/db is live. */
function redactedHost(uri) {
  try {
    const withoutScheme = uri.split('://')[1] || uri;
    const afterAuth = withoutScheme.split('@').pop();
    return afterAuth.split('?')[0];
  } catch {
    return '(unparseable)';
  }
}

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(uri);
  console.log('MongoDB connected:', redactedHost(uri));
}
