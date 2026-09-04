import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export async function protect(req, res, next) {
  try {
    const value = req.headers.authorization || '';
    const token = value.startsWith('Bearer ') ? value.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please log in.' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
