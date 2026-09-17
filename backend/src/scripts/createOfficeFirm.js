import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/db.js';
import Firm from '../models/Firm.js';
import User from '../models/User.js';

try {
  await connectDatabase();
  console.log('Connected to database.');

  // 1. Create or get Head Office Firm
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

  console.log(`✅ Office Firm ready: "${officeFirm.name}" (ID: ${officeFirm._id}, Code: ${officeFirm.code})`);

  // 2. Grant access to all Admin and Developer users
  const updateResult = await User.updateMany(
    { role: { $in: ['admin', 'developer'] } },
    { $addToSet: { firms: officeFirm._id } }
  );
  console.log(`✅ Assigned Head Office to ${updateResult.modifiedCount} admin/developer user(s).`);

  // 3. Create default office designations if not present
  const adminUser = await User.findOne({ role: { $in: ['developer', 'admin'] } }).lean();
  const defaultDesignations = ['Management', 'Head', 'Developer', 'Accountant', 'Support Staff'];
  const Designation = (await import('../attendance/models/Designation.js')).default;
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
  console.log(`✅ Default Office Designations ready: ${defaultDesignations.join(', ')}`);

  // 4. Create default office location if not present
  const WorkLocation = (await import('../attendance/models/WorkLocation.js')).default;
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
  console.log('✅ Default Office Location ready: Main Office');

  console.log('🎉 Office setup completed successfully! You can now select Head Office in the dropdown.');
} catch (error) {
  console.error('❌ Error creating office firm:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}

