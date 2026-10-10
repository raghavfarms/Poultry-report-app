import Role from '../models/Role.js';
import User from '../models/User.js';
import { badRequest } from '../utils/http.js';

export async function getRoles(req, res) {
  // 1. Fetch registered roles from DB (all roles, both active and inactive)
  let roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean();

  // 2. Discover any roles currently assigned to registered users in DB
  const userRoles = await User.distinct('role');
  const existingCodes = new Set(roles.map((r) => r.code?.toLowerCase()));

  for (const rCode of userRoles) {
    if (!rCode) continue;
    const lower = String(rCode).toLowerCase().trim();
    if (!existingCodes.has(lower)) {
      const name = lower
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const defaultModules = ['admin', 'developer', 'office', 'farm_incharge'].includes(lower)
        ? ['diesel', 'transport', 'attendance', 'medicine']
        : lower === 'user'
        ? ['diesel']
        : ['attendance', 'medicine'];

      const created = await Role.findOneAndUpdate(
        { code: lower },
        {
          $setOnInsert: {
            name,
            code: lower,
            description: `Default role for registered users (${name})`,
            allowedModules: defaultModules,
            permissions: {
              attendance_scan: ['admin', 'developer', 'office', 'farm_incharge', 'supervisor', 'security'].includes(lower),
              attendance_report: ['admin', 'developer', 'office', 'farm_incharge', 'supervisor'].includes(lower),
              worker_master: ['admin', 'developer', 'office', 'farm_incharge', 'supervisor'].includes(lower),
              attendance_edit: ['admin', 'developer'].includes(lower),
              attendance_autocut: ['admin', 'developer', 'office', 'farm_incharge'].includes(lower),
              asset_master: ['admin', 'developer'].includes(lower),
              transport_master: ['admin', 'developer'].includes(lower),
              medicine_master: ['admin', 'developer'].includes(lower),
              attendance_admin_master: ['admin', 'developer'].includes(lower),
            },
            isSystem: lower === 'admin',
            active: true,
          },
        },
        { upsert: true, new: true }
      ).lean();

      roles.push(created);
      existingCodes.add(lower);
    }
  }

  // Sort: system roles first, then alphabetically
  roles.sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  res.json({ roles });
}

export async function createRole(req, res) {
  const name = String(req.body.name || '').trim();
  if (name.length < 2) throw badRequest('Role name must have at least 2 characters.');

  let code = String(req.body.code || name).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!code) code = name.toLowerCase().replace(/\s+/g, '_');

  const existing = await Role.findOne({ code });
  if (existing) throw badRequest(`A role with code '${code}' already exists.`);

  const allowedModules = Array.isArray(req.body.allowedModules) ? req.body.allowedModules : ['attendance'];
  const permissions = {
    attendance_scan: Boolean(req.body.permissions?.attendance_scan),
    attendance_report: Boolean(req.body.permissions?.attendance_report),
    worker_master: Boolean(req.body.permissions?.worker_master),
    attendance_edit: Boolean(req.body.permissions?.attendance_edit),
    attendance_autocut: Boolean(req.body.permissions?.attendance_autocut),
    asset_master: Boolean(req.body.permissions?.asset_master),
    transport_master: Boolean(req.body.permissions?.transport_master),
    medicine_master: Boolean(req.body.permissions?.medicine_master),
    attendance_admin_master: Boolean(req.body.permissions?.attendance_admin_master),
  };

  const moduleFirms = typeof req.body.moduleFirms === 'object' && req.body.moduleFirms !== null
    ? req.body.moduleFirms
    : {};

  const role = await Role.create({
    name,
    code,
    description: String(req.body.description || '').trim(),
    allowedModules,
    moduleFirms,
    permissions,
    isSystem: false,
    active: true,
  });

  res.status(201).json({ role });
}

export async function updateRole(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) throw badRequest('Role not found.');

  if (req.body.name) {
    role.name = String(req.body.name).trim();
  }
  if (req.body.description !== undefined) {
    role.description = String(req.body.description).trim();
  }
  if (Array.isArray(req.body.allowedModules)) {
    role.allowedModules = req.body.allowedModules;
  }
  if (req.body.moduleFirms !== undefined) {
    role.moduleFirms = req.body.moduleFirms || {};
    role.markModified('moduleFirms');
  }
  if (req.body.permissions) {
    role.permissions = {
      attendance_scan: req.body.permissions.attendance_scan ?? role.permissions.attendance_scan,
      attendance_report: req.body.permissions.attendance_report ?? role.permissions.attendance_report,
      worker_master: req.body.permissions.worker_master ?? role.permissions.worker_master,
      attendance_edit: req.body.permissions.attendance_edit ?? role.permissions.attendance_edit,
      attendance_autocut: req.body.permissions.attendance_autocut ?? role.permissions.attendance_autocut,
      asset_master: req.body.permissions.asset_master ?? role.permissions.asset_master,
      transport_master: req.body.permissions.transport_master ?? role.permissions.transport_master,
      medicine_master: req.body.permissions.medicine_master ?? role.permissions.medicine_master,
      attendance_admin_master: req.body.permissions.attendance_admin_master ?? role.permissions.attendance_admin_master,
    };
  }

  await role.save();
  res.json({ role });
}

export async function toggleRoleStatus(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) throw badRequest('Role not found.');

  if (role.code === 'admin' && role.active) {
    throw badRequest('Primary Administrator role cannot be deactivated.');
  }

  role.active = !role.active;
  await role.save();

  res.json({ success: true, active: role.active });
}

export async function deleteRole(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) throw badRequest('Role not found.');

  if (role.code === 'admin') {
    throw badRequest('Primary Administrator role cannot be deleted.');
  }

  const assignedUsersCount = await User.countDocuments({ role: role.code });
  if (assignedUsersCount > 0) {
    throw badRequest(`Cannot delete role. It is currently assigned to ${assignedUsersCount} user(s). Please reassign them first.`);
  }

  await Role.findByIdAndDelete(req.params.id);

  res.json({ success: true, message: 'Role deleted permanently.' });
}
