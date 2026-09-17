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

  // 3. Ensure Head Office firm, default designations, and office location exist
  try {
    const officeFirm = await Firm.findOneAndUpdate(
      { code: 'OFFICE' },
      {
        $setOnInsert: {
          name: 'Head Office',
          code: 'OFFICE',
          active: true,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );

    await User.updateMany(
      { role: { $in: ['admin', 'developer'] } },
      { $addToSet: { firms: officeFirm._id } }
    );

    const adminUser = await User.findOne({ role: { $in: ['developer', 'admin'] } }).lean();
    const Designation = (await import('./attendance/models/Designation.js')).default;
    const existingDesignationCount = await Designation.countDocuments({ firm: officeFirm._id });
    if (existingDesignationCount === 0) {
      const defaultDesignations = ['Management', 'Head', 'Developer', 'Accountant', 'Support Staff'];
      for (const name of defaultDesignations) {
        await Designation.findOneAndUpdate(
          { firm: officeFirm._id, nameKey: name.toLowerCase() },
          {
            $setOnInsert: {
              firm: officeFirm._id,
              name,
              nameKey: name.toLowerCase(),
              active: true,
              createdBy: adminUser?._id,
            },
          },
          { upsert: true, new: true }
        );
      }
    }

    const WorkLocation = (await import('./attendance/models/WorkLocation.js')).default;
    const existingLocationCount = await WorkLocation.countDocuments({ firm: officeFirm._id });
    if (existingLocationCount === 0) {
      await WorkLocation.findOneAndUpdate(
        { firm: officeFirm._id, nameKey: 'main office' },
        {
          $setOnInsert: {
            firm: officeFirm._id,
            name: 'Main Office',
            nameKey: 'main office',
            type: 'MISCELLANEOUS',
            order: 1,
            active: true,
            createdBy: adminUser?._id,
          },
        },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Head Office firm, designations, and location verified.');
  } catch (err) {
    console.error('Head Office auto-seed note:', err.message);
  }

  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}


start().catch((error) => {
  console.error(error);
  process.exit(1);
});


