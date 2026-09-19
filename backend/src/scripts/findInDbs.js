import mongoose from 'mongoose';
import 'dotenv/config';

async function check() {
  const client = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/poultry_development');
  const adminDb = mongoose.connection.db.admin();
  const dbs = await adminDb.listDatabases();
  console.log('Databases:', dbs.databases.map(d => d.name));

  for (const d of dbs.databases) {
    if (d.name.includes('poultry') || d.name.includes('attendance')) {
      const db = mongoose.connection.client.db(d.name);
      const cols = await db.listCollections().toArray();
      for (const col of cols) {
        const found = await db.collection(col.name).findOne({ $or: [{ name: /Cold Room/i }, { workLocationNameSnapshot: /Cold Room/i }] });
        if (found) {
          console.log(`FOUND "Cold Room" in Database: ${d.name}, Collection: ${col.name}`);
          console.log(found);
        }
      }
    }
  }
  await mongoose.disconnect();
}
check().catch(console.error);

