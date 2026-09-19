import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('.env') });

async function check() {
  console.log('Connecting to:', process.env.MONGODB_URI?.slice(0, 40) + '...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB:', mongoose.connection.name);
  const db = mongoose.connection.db;

  const firms = await db.collection('firms').find({}).toArray();
  console.log('Firms:', firms.map(f => ({ id: f._id, name: f.name, code: f.code })));

  const sanjanaFirm = firms.find(f => /sanjana/i.test(f.name));
  console.log('Sanjana Firm ID:', sanjanaFirm?._id);

  const locations = await db.collection('attendanceworklocations')
    .find(sanjanaFirm ? { firm: sanjanaFirm._id } : {})
    .sort({ order: 1, name: 1 })
    .toArray();

  console.log(`\nFound ${locations.length} locations for Sanjana:\n`);
  for (const loc of locations) {
    console.log(`- "${loc.name}": order=${loc.order} (type: ${typeof loc.order}), type=${loc.type}, active=${loc.active}`);
  }

  await mongoose.disconnect();
}
check().catch(console.error);

