import mongoose from 'mongoose';
import 'dotenv/config';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/poultry_development');
  const db = mongoose.connection.db;
  const locations = await db.collection('attendanceworklocations').find({}).toArray();
  console.log('Total locations:', locations.length);
  for (const loc of locations) {
    console.log(`Name: "${loc.name}", Type: ${loc.type}, Order: ${loc.order} (${typeof loc.order})`);
  }
  await mongoose.disconnect();
}
check().catch(console.error);

