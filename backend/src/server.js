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

  // 2. Permanently remove legacy / test 'Sudheer' user account
  try {
    const deletedSudheer = await User.deleteMany({ email: 'sudheer@gmail.com' });
    if (deletedSudheer.deletedCount > 0) {
      console.log(`✅ Permanently removed ${deletedSudheer.deletedCount} legacy Sudheer account(s).`);
    }
  } catch (err) {
    console.error('Sudheer cleanup note:', err.message);
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

    // 3a. Ensure Head Office firm is linked to admin/dev, and default allowedModules/permissions initialized if missing
    await User.updateMany(
      { role: { $in: ['admin', 'developer'] } },
      { $addToSet: { firms: officeFirm._id } }
    );

    // 3b. Sync missing permissions and allowedModules for all existing registered users
    const allExistingUsers = await User.find({}).lean();
    for (const u of allExistingUsers) {
      const needsModules = !u.allowedModules || u.allowedModules.length === 0;
      const needsPermissions = !u.permissions || u.permissions.attendance_scan === undefined;
      if (needsModules || needsPermissions) {
        let defaultModules = ['diesel', 'transport', 'attendance', 'medicine'];
        let defaultPerms = {
          attendance_scan: true,
          attendance_report: false,
          worker_master: true,
          attendance_edit: false,
          asset_master: false,
          transport_master: false,
          medicine_master: false,
          attendance_admin_master: false,
        };

        if (['admin', 'developer'].includes(u.role)) {
          defaultModules = ['diesel', 'transport', 'attendance', 'medicine'];
          defaultPerms = {
            attendance_scan: true,
            attendance_report: true,
            worker_master: true,
            attendance_edit: true,
            asset_master: true,
            transport_master: true,
            medicine_master: true,
            attendance_admin_master: true,
          };
        } else if (u.role === 'security') {
          defaultModules = ['attendance'];
          defaultPerms = {
            attendance_scan: true,
            attendance_report: false,
            worker_master: false,
            attendance_edit: false,
            asset_master: false,
            transport_master: false,
            medicine_master: false,
            attendance_admin_master: false,
          };
        } else if (['office', 'farm_incharge', 'supervisor'].includes(u.role)) {
          defaultModules = ['diesel', 'transport', 'attendance', 'medicine'];
          defaultPerms = {
            attendance_scan: true,
            attendance_report: true,
            worker_master: true,
            attendance_edit: false,
            asset_master: false,
            transport_master: false,
            medicine_master: false,
            attendance_admin_master: false,
          };
        }

        await User.updateOne(
          { _id: u._id },
          {
            $set: {
              ...(needsModules ? { allowedModules: defaultModules } : {}),
              ...(needsPermissions ? { permissions: defaultPerms } : {}),
            },
          }
        );
      }
    }

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

  // 4. Sync workers whose designation includes 'supervisor' to have isSupervisor: true
  try {
    const Designation = (await import('./attendance/models/Designation.js')).default;
    const Worker = (await import('./attendance/models/Worker.js')).default;
    const supervisorDesigs = await Designation.find({ name: /supervisor/i }).select('_id').lean();
    if (supervisorDesigs.length > 0) {
      const updated = await Worker.updateMany(
        { designation: { $in: supervisorDesigs.map((d) => d._id) }, isSupervisor: { $ne: true } },
        { $set: { isSupervisor: true } }
      );
      if (updated.modifiedCount > 0) {
        console.log(`✅ Synced ${updated.modifiedCount} supervisor worker(s) to isSupervisor: true.`);
      }
    }
  } catch (err) {
    console.error('Supervisor sync note:', err.message);
  }

  // 5. Ensure Default Roles exist
  try {
    const Role = (await import('./models/Role.js')).default;
    const defaultRoles = [
      {
        name: 'Administrator',
        code: 'admin',
        description: 'Full system administration, user management, and firm configuration',
        allowedModules: ['diesel', 'transport', 'attendance', 'medicine'],
        permissions: {
          attendance_scan: true,
          attendance_report: true,
          worker_master: true,
          attendance_edit: true,
          asset_master: true,
          transport_master: true,
          medicine_master: true,
          attendance_admin_master: true,
        },
        isSystem: true,
      },
      {
        name: 'Developer',
        code: 'developer',
        description: 'System developer with unrestricted access and debugging tools',
        allowedModules: ['diesel', 'transport', 'attendance', 'medicine'],
        permissions: {
          attendance_scan: true,
          attendance_report: true,
          worker_master: true,
          attendance_edit: true,
          asset_master: true,
          transport_master: true,
          medicine_master: true,
          attendance_admin_master: true,
        },
        isSystem: true,
      },
      {
        name: 'Head Office',
        code: 'office',
        description: 'Office staff with full report & operational visibility',
        allowedModules: ['diesel', 'transport', 'attendance', 'medicine'],
        permissions: {
          attendance_scan: true,
          attendance_report: true,
          worker_master: true,
          attendance_edit: false,
          asset_master: false,
          transport_master: false,
          medicine_master: false,
          attendance_admin_master: false,
        },
        isSystem: true,
      },
      {
        name: 'Farm Incharge',
        code: 'farm_incharge',
        description: 'Farm Incharge with attendance registers and worker master',
        allowedModules: ['attendance', 'medicine'],
        permissions: {
          attendance_scan: true,
          attendance_report: true,
          worker_master: true,
          attendance_edit: false,
          asset_master: false,
          transport_master: false,
          medicine_master: false,
          attendance_admin_master: false,
        },
        isSystem: true,
      },
      {
        name: 'Supervisor',
        code: 'supervisor',
        description: 'Farm supervisor for attendance and worker enrolment',
        allowedModules: ['attendance', 'medicine'],
        permissions: {
          attendance_scan: true,
          attendance_report: true,
          worker_master: true,
          attendance_edit: false,
          asset_master: false,
          transport_master: false,
          medicine_master: false,
          attendance_admin_master: false,
        },
        isSystem: true,
      },
      {
        name: 'Security',
        code: 'security',
        description: 'Gate security personnel for face attendance scanning only',
        allowedModules: ['attendance'],
        permissions: {
          attendance_scan: true,
          attendance_report: false,
          worker_master: false,
          attendance_edit: false,
          asset_master: false,
          transport_master: false,
          medicine_master: false,
          attendance_admin_master: false,
        },
        isSystem: true,
      },
    ];

    for (const r of defaultRoles) {
      await Role.findOneAndUpdate(
        { code: r.code },
        {
          $setOnInsert: r,
          ...(['admin', 'developer'].includes(r.code)
            ? {
                $addToSet: { allowedModules: 'medicine' },
                $set: { 'permissions.medicine_master': true },
              }
            : {}),
        },
        { upsert: true, new: true }
      );
    }
    console.log('✅ Default roles verified (Head Office, Farm Incharge, Supervisor, Security).');
  } catch (err) {
    console.error('Role auto-seed note:', err.message);
  }

  // 6. Remove test / legacy 'Apex Vet Pharma' supplier
  try {
    const Supplier = (await import('./medicine/models/Supplier.js')).default;
    const deleted = await Supplier.deleteMany({ name: /apex/i });
    if (deleted.deletedCount > 0) {
      console.log(`✅ Removed ${deleted.deletedCount} legacy Apex supplier record(s).`);
    }
  } catch (err) {
    console.error('Apex supplier cleanup note:', err.message);
  }

  app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
}


start().catch((error) => {
  console.error(error);
  process.exit(1);
});


