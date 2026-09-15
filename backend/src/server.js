import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import bcrypt from 'bcryptjs';
import User from './models/User.js';
import Firm from './models/Firm.js';

const port = Number(process.env.PORT || 5000);

async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  await connectDatabase();

  // 1. Convert all old labour accounts to 'user'
  await User.updateMany({ role: 'labour' }, { $set: { role: 'user' } }).catch(() => {});

  // 2. Ensure Sudheer account is active and converted to 'user' with correct password
  try {
    const firms = await Firm.find({ active: true }).select('_id').lean();
    const firmIds = firms.map((f) => f._id);
    const existingSudheer = await User.findOne({ email: 'sudheer@gmail.com' });
    const passwordHash = await bcrypt.hash('Sudheer@1234', 12);

    if (existingSudheer) {
      existingSudheer.role = 'user';
      existingSudheer.active = true;
      existingSudheer.passwordHash = passwordHash;
      if (!existingSudheer.firms || existingSudheer.firms.length === 0) {
        existingSudheer.firms = firmIds;
      }
      await existingSudheer.save();
    } else if (firmIds.length > 0) {
      await User.create({
        name: 'Sudheer',
        email: 'sudheer@gmail.com',
        passwordHash,
        role: 'user',
        firms: firmIds,
        active: true,
      });
    }
  } catch (err) {
    console.error('Sudheer account sync note:', err.message);
  }

  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});


