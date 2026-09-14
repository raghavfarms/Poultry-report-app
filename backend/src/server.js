import 'dotenv/config';
import app from './app.js';
import { connectDatabase } from './config/db.js';
import User from './models/User.js';

const port = Number(process.env.PORT || 5000);

async function start() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  await connectDatabase();
  await User.updateMany({ role: 'labour' }, { $set: { role: 'office' } }).catch(() => {});
  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});


