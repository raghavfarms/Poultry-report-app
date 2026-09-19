import mongoose from 'mongoose';
import 'dotenv/config';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/poultry_development');
  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log('Collections:', collections.map(c => c.name));
  
  // Search for "Cold Room" across all collections
  for (const col of collections) {
    const doc = await db.collection(col.name).findOne({ $or: [{ name: /Cold Room/i }, { workLocationNameSnapshot: /Cold Room/i }] });
    if (doc) {
      console.log(`Found "Cold Room" in collection: ${col.name}`);
      console.log(JSON.stringify(doc, null, 2));
    }
  }
  await mongoose.disconnect();
}
check().catch(console.error);

