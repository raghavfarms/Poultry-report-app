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

export function adminOnly(req, res, next) {
  if (!['admin', 'developer'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Admin access is required.' });
  }
  next();
}

export function attendanceStaffOnly(req, res, next) {
  if (!['admin', 'developer', 'office', 'supervisor', 'security', 'farm_incharge'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Attendance staff access is required.' });
  }
  next();
}

export function supervisorOrAdminOnly(req, res, next) {
  if (!['admin', 'developer', 'office', 'supervisor'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Supervisor or admin access is required.' });
  }
  next();
}

export function attendanceAdminOnly(req, res, next) {
  if (!['admin', 'developer', 'office', 'supervisor', 'farm_incharge'].includes(req.user?.role)) {
    return res.status(403).json({ message: 'Attendance administrator access is required.' });
  }
  next();
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
