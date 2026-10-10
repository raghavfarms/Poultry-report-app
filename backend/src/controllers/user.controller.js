import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Firm from '../models/Firm.js';
import Role from '../models/Role.js';
import { badRequest } from '../utils/http.js';

export async function getUsers(req, res) {
  const users = await User.find({})
    .select('-passwordHash')
    .populate('firms', 'name code active')
    .sort({ createdAt: -1 })
    .lean();

  const allLiveModules = ['diesel', 'transport', 'attendance', 'medicine'];

  const mapped = users.map((u) => {
    const isAdminOrDev = ['admin', 'developer'].includes(u.role);
    const userModules = Array.isArray(u.allowedModules) && u.allowedModules.length
      ? u.allowedModules
      : (isAdminOrDev ? allLiveModules : ['attendance']);

    return {
      ...u,
      moduleFirms: u.moduleFirms || {},
      allowedModules: userModules,
      permissions: {
        attendance_scan: u.permissions?.attendance_scan ?? true,
        attendance_report: u.permissions?.attendance_report ?? (isAdminOrDev ? true : false),
        worker_master: u.permissions?.worker_master ?? true,
        attendance_edit: u.permissions?.attendance_edit ?? (isAdminOrDev ? true : false),
        attendance_autocut: u.permissions?.attendance_autocut ?? (isAdminOrDev ? true : false),
        asset_master: u.permissions?.asset_master ?? (isAdminOrDev ? true : false),
        transport_master: u.permissions?.transport_master ?? (isAdminOrDev ? true : false),
        medicine_master: u.permissions?.medicine_master ?? (isAdminOrDev ? true : false),
        attendance_admin_master: u.permissions?.attendance_admin_master ?? (isAdminOrDev ? true : false),
      },
    };
  });

  res.json({ users: mapped });
}

export async function createUser(req, res) {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = String(req.body.role || 'supervisor').trim().toLowerCase();

  if (name.length < 2) throw badRequest('Name must have at least 2 characters.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Valid email address is required.');
  if (password.length < 6) throw badRequest('Password must be at least 6 characters.');

  const existing = await User.findOne({ email });
  if (existing) throw badRequest('An account with this email already exists.');

  const firmIds = [...new Set((req.body.firms || []).map(String))];
  if (!firmIds.length) throw badRequest('Select at least one firm for this user.');

  const firms = await Firm.find({ _id: { $in: firmIds }, active: true });
  if (firms.length !== firmIds.length) throw badRequest('One or more selected firms are invalid.');

  // If role template exists, merge defaults with request
  const roleDoc = await Role.findOne({ code: role, active: true }).lean();

  const allowedModules = Array.isArray(req.body.allowedModules) && req.body.allowedModules.length
    ? req.body.allowedModules
    : (roleDoc?.allowedModules || ['attendance']);

  const permissions = {
    attendance_scan: req.body.permissions?.attendance_scan ?? roleDoc?.permissions?.attendance_scan ?? true,
    attendance_report: req.body.permissions?.attendance_report ?? roleDoc?.permissions?.attendance_report ?? false,
    worker_master: req.body.permissions?.worker_master ?? roleDoc?.permissions?.worker_master ?? true,
    attendance_edit: req.body.permissions?.attendance_edit ?? roleDoc?.permissions?.attendance_edit ?? false,
    attendance_autocut: req.body.permissions?.attendance_autocut ?? roleDoc?.permissions?.attendance_autocut ?? false,
    asset_master: req.body.permissions?.asset_master ?? roleDoc?.permissions?.asset_master ?? false,
    transport_master: req.body.permissions?.transport_master ?? roleDoc?.permissions?.transport_master ?? false,
    medicine_master: req.body.permissions?.medicine_master ?? roleDoc?.permissions?.medicine_master ?? false,
    attendance_admin_master: req.body.permissions?.attendance_admin_master ?? roleDoc?.permissions?.attendance_admin_master ?? false,
  };

  const passwordHash = await bcrypt.hash(password, 12);

  const moduleFirms = typeof req.body.moduleFirms === 'object' && req.body.moduleFirms !== null
    ? req.body.moduleFirms
    : (roleDoc?.moduleFirms || {});

  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    firms: firmIds,
    allowedModules,
    moduleFirms,
    permissions,
    active: true,
  });

  const created = await User.findById(user._id).select('-passwordHash').populate('firms', 'name code active').lean();
  res.status(201).json({ user: created });
}

export async function updateUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw badRequest('User not found.');

  if (req.body.name) {
    const name = String(req.body.name).trim();
    if (name.length < 2) throw badRequest('Name must have at least 2 characters.');
    user.name = name;
  }

  if (req.body.email) {
    const email = String(req.body.email).trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw badRequest('Valid email address is required.');
    const duplicate = await User.findOne({ email, _id: { $ne: user._id } });
    if (duplicate) throw badRequest('Another account with this email already exists.');
    user.email = email;
  }

  if (req.body.role) {
    user.role = String(req.body.role).trim().toLowerCase();
  }

  if (Array.isArray(req.body.firms)) {
    const firmIds = [...new Set(req.body.firms.map(String))];
    if (!firmIds.length) throw badRequest('Select at least one firm.');
    const validFirms = await Firm.find({ _id: { $in: firmIds }, active: true });
    if (validFirms.length !== firmIds.length) throw badRequest('One or more selected firms are invalid.');
    user.firms = firmIds;
  }

  if (Array.isArray(req.body.allowedModules)) {
    user.allowedModules = req.body.allowedModules;
  }

  if (req.body.moduleFirms !== undefined) {
    user.moduleFirms = req.body.moduleFirms || {};
    user.markModified('moduleFirms');
  }

  if (req.body.permissions) {
    user.permissions = {
      attendance_scan: req.body.permissions.attendance_scan ?? user.permissions.attendance_scan,
      attendance_report: req.body.permissions.attendance_report ?? user.permissions.attendance_report,
      worker_master: req.body.permissions.worker_master ?? user.permissions.worker_master,
      attendance_edit: req.body.permissions.attendance_edit ?? user.permissions.attendance_edit,
      attendance_autocut: req.body.permissions.attendance_autocut ?? user.permissions.attendance_autocut,
      asset_master: req.body.permissions.asset_master ?? user.permissions.asset_master,
      transport_master: req.body.permissions.transport_master ?? user.permissions.transport_master,
      medicine_master: req.body.permissions.medicine_master ?? user.permissions.medicine_master,
      attendance_admin_master: req.body.permissions.attendance_admin_master ?? user.permissions.attendance_admin_master,
    };
  }

  if (req.body.password) {
    const password = String(req.body.password);
    if (password.length < 6) throw badRequest('Password must be at least 6 characters.');
    user.passwordHash = await bcrypt.hash(password, 12);
  }

  await user.save();

  const updated = await User.findById(user._id).select('-passwordHash').populate('firms', 'name code active').lean();
  res.json({ user: updated });
}

export async function toggleUserStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw badRequest('User not found.');

  if (String(user._id) === String(req.user._id)) {
    throw badRequest('You cannot deactivate your own account.');
  }

  user.active = !user.active;
  await user.save();

  res.json({ success: true, active: user.active });
}

export async function deleteUser(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw badRequest('User not found.');

  if (String(user._id) === String(req.user._id)) {
    throw badRequest('You cannot delete your own account.');
  }

  if (['admin', 'developer'].includes(user.role)) {
    const adminCount = await User.countDocuments({ role: user.role, active: true });
    if (adminCount <= 1) {
      throw badRequest(`Cannot delete the last remaining ${user.role} account.`);
    }
  }

  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'User permanently deleted.' });
}
