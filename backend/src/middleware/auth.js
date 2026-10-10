import { requireRegisteredWorker } from '../attendance/services/registeredUser.service.js';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, res, next) {
  try {
    const value = req.headers.authorization || '';
    const token = value.startsWith('Bearer ') ? value.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please log in.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'worker') {
      const Worker = (await import('../attendance/models/Worker.js')).default;
      const worker = await Worker.findById(decoded.sub).populate('firm', 'name code active').lean();
      if (!worker || !worker.active) {
        return res.status(401).json({ message: 'Worker account is inactive or not found.' });
      }
      await requireRegisteredWorker(worker);
      req.user = {
        _id: worker._id,
        role: 'worker',
        name: worker.fullName,
        worker,
        firm: worker.firm?._id || worker.firm,
        firms: [worker.firm?._id || worker.firm],
      };
      return next();
    }

    const user = await User.findById(decoded.sub).select('-passwordHash').lean();
    if (!user || !user.active) {
      return res.status(401).json({ message: 'This account is unavailable.' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Your session is invalid or expired.' });
  }
}

export function attendanceEditOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || (
    req.user?.allowedModules?.includes('attendance') &&
    req.user?.permissions?.attendance_edit === true
  )) return next();
  return res.status(403).json({ message: 'Edit Attendance permission is required.' });
}

export function attendanceAutoCutOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || (
    req.user?.allowedModules?.includes('attendance') &&
    (req.user?.permissions?.attendance_autocut === true || req.user?.permissions?.attendance_edit === true)
  )) return next();
  return res.status(403).json({ message: 'Auto Cut permission is required.' });
}

export function attendanceReportsOnly(req, res, next) {
  if (['admin', 'developer'].includes(req.user?.role) || (
    req.user?.allowedModules?.includes('attendance') &&
    req.user?.permissions?.attendance_report === true
  )) return next();
  return res.status(403).json({ message: 'Monthly Attendance Report permission is required.' });
}

export function requireModuleAccess(module) {
  return (req, res, next) => {
    if (Array.isArray(req.user?.allowedModules)) {
      if (req.user.allowedModules.includes(module)) return next();
      return res.status(403).json({ message: 'You do not have access to this report module.' });
    }
    if (['admin', 'developer'].includes(req.user?.role) || req.user?.allowedModules?.includes(module)) return next();
    return res.status(403).json({ message: 'You do not have access to this report module.' });
  };
}

export function masterOnly(permission) {
  return (req, res, next) => {
    if (req.user?.permissions?.[permission] === true) return next();
    if (['admin', 'developer'].includes(req.user?.role) && req.user?.permissions?.[permission] !== false) return next();
    return res.status(403).json({ message: 'Master access is required.' });
  };
}

export function adminOnly(req, res, next) {
  if (!['admin', 'developer'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access is required.' });
  }
  next();
}

export function attendanceStaffOnly(req, res, next) {
  if (
    ['admin', 'developer'].includes(req.user?.role) ||
    req.user?.allowedModules?.includes('attendance') ||
    req.user?.permissions?.attendance_scan ||
    req.user?.permissions?.worker_master ||
    ['office', 'supervisor', 'security', 'farm_incharge'].includes(req.user?.role)
  ) {
    return next();
  }
  return res.status(403).json({ message: 'Attendance staff access is required.' });
}

export function supervisorOrAdminOnly(req, res, next) {
  if (
    ['admin', 'developer'].includes(req.user?.role) ||
    req.user?.permissions?.attendance_report ||
    ['office', 'supervisor'].includes(req.user?.role)
  ) {
    return next();
  }
  return res.status(403).json({ message: 'Supervisor or admin access is required.' });
}

export function attendanceAdminOnly(req, res, next) {
  if (
    ['admin', 'developer'].includes(req.user?.role) ||
    req.user?.permissions?.worker_master === true ||
    req.user?.permissions?.attendance_admin_master === true
  ) {
    return next();
  }
  return res.status(403).json({ message: 'Worker Master access is required.' });
}

export function attendanceFullMasterOnly(req, res, next) {
  if (
    ['admin', 'developer'].includes(req.user?.role) ||
    req.user?.permissions?.attendance_admin_master === true
  ) {
    return next();
  }
  return res.status(403).json({ message: 'Attendance Master access is required (Geofence, Sheds, Designations).' });
}

export function developerOnly(req, res, next) {
  if (req.user?.role !== 'developer') {
    return res.status(403).json({ message: 'This report is still in development.' });
  }
  next();
}

export function canAccessFirm(user, firmId) {
  return ['admin', 'developer'].includes(user.role) || user.firms.some((id) => String(id) === String(firmId));
}

export function requireFirmAccess(req, res, next) {
  const firmId = req.params.firmId || req.query.firmId || req.body.firmId;
  if (!firmId || !canAccessFirm(req.user, firmId)) {
    return res.status(403).json({ message: 'You do not have access to this firm.' });
  }
  next();
}
