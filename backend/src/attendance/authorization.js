import { objectId } from './validation.js';

// Attendance honours assigned firms for admins too. Existing module permissions are unchanged.
export function firmScope(user, requestedFirm) {
  const firm = requestedFirm === undefined ? undefined : objectId(requestedFirm, 'Firm');
  if (user.role === 'developer') return firm ? { firm } : {};
  const permitted = (user.firms || []).map((id) => String(id._id || id));
  if (firm && !permitted.includes(String(firm))) {
    const error = new Error('You do not have access to this firm.');
    error.status = 403;
    throw error;
  }
  return { firm: firm || { $in: permitted.map((id) => objectId(id, 'Assigned firm')) } };
}


