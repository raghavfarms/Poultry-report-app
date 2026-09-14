import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import User from '../models/User.js';

try {
  await connectDatabase();
  const labourUsers = await User.find({ role: 'labour' }).select('name email role');
  console.log(`Found ${labourUsers.length} user(s) with role 'labour':`, labourUsers.map(u => ({ id: u._id, name: u.name, email: u.email })));

  const result = await User.updateMany(
    { role: 'labour' },
    { $set: { role: 'office' } },
  );

  console.log(`Updated ${result.modifiedCount} user(s) from 'labour' to 'office'.`);
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

