import Role from '../models/Role.js';
import User from '../models/User.js';
import { badRequest } from '../utils/http.js';

export async function getRoles(req, res) {
  const roles = await Role.find({ active: true }).sort({ isSystem: -1, name: 1 }).lean();
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
    attendance_admin_master: Boolean(req.body.permissions?.attendance_admin_master),
  };

  const role = await Role.create({
    name,
    code,
    description: String(req.body.description || '').trim(),
    allowedModules,
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
  if (req.body.permissions) {
    role.permissions = {
      attendance_scan: req.body.permissions.attendance_scan ?? role.permissions.attendance_scan,
      attendance_report: req.body.permissions.attendance_report ?? role.permissions.attendance_report,
      worker_master: req.body.permissions.worker_master ?? role.permissions.worker_master,
      attendance_admin_master: req.body.permissions.attendance_admin_master ?? role.permissions.attendance_admin_master,
    };
  }

  await role.save();
  res.json({ role });
}

export async function deleteRole(req, res) {
  const role = await Role.findById(req.params.id);
  if (!role) throw badRequest('Role not found.');

  if (role.isSystem) {
    throw badRequest('System core roles cannot be deleted.');
  }

  const assignedUsersCount = await User.countDocuments({ role: role.code, active: true });
  if (assignedUsersCount > 0) {
    throw badRequest(`Cannot delete role. It is currently assigned to ${assignedUsersCount} active user(s).`);
  }

  role.active = false;
  await role.save();

  res.json({ success: true, message: 'Role deactivated successfully.' });
}
