import mongoose from 'mongoose';

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error('MONGODB_URI is not configured');
  const dbName = process.env.MONGODB_DB_NAME?.trim();
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(uri, {
      ...(dbName ? { dbName } : {}),
      serverSelectionTimeoutMS: 10_000,
      connectTimeoutMS: 10_000,
    });
  } catch (error) {
    const serverErrors = [...(error.reason?.servers?.values() || [])]
      .map((server) => server.error?.message)
      .filter(Boolean);

    if (serverErrors.length) {
      console.error('MongoDB server errors:', [...new Set(serverErrors)].join('; '));
    }
    throw error;
  }
  console.log(`MongoDB connected to ${mongoose.connection.name}`);
}
