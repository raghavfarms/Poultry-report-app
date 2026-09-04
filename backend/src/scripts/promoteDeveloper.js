import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import User from '../models/User.js';

const email = String(process.argv[2] || '').trim().toLowerCase();

if (!/^\S+@\S+\.\S+$/.test(email)) {
  console.error('Usage: npm run promote-developer -- your@email.com');
  process.exit(1);
}

try {
  await connectDatabase();
  const user = await User.findOneAndUpdate(
    { email },
    { role: 'developer' },
    { new: true, runValidators: true },
  );

  if (!user) throw new Error(`No user exists with email ${email}`);
  console.log(`${user.email} is now a developer.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
