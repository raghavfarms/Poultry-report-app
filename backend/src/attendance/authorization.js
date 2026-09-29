import { objectId } from './validation.js';

// Attendance honours assigned firms for supervisors/staff. Admins and developers have access to all firms.
export function firmScope(user, requestedFirm) {
  const isAllOrEmpty = !requestedFirm || requestedFirm === 'all' || requestedFirm === 'null' || requestedFirm === 'undefined';
  const firm = isAllOrEmpty ? undefined : objectId(requestedFirm, 'Firm');
  if (['developer', 'admin'].includes(user?.role)) return firm ? { firm } : {};

  // Per-module firm scoping: check attendance-specific firms first, fallback to user.firms
  const attendanceFirms = user?.moduleFirms?.attendance;
  const allowedList = (Array.isArray(attendanceFirms) && attendanceFirms.length > 0)
    ? attendanceFirms
    : (user?.firms || []);

  const permitted = allowedList.map((id) => String(id._id || id));
  if (firm && !permitted.includes(String(firm))) {
    const error = new Error('You do not have access to this firm.');
    error.status = 403;
    throw error;
  }
  return { firm: firm || { $in: permitted.map((id) => objectId(id, 'Assigned firm')) } };
}


export function sortFirms(firms = []) {
  return [...firms].sort((a, b) => {
    const isOfficeA = a.code === 'OFFICE' || /office/i.test(a.name || '');
    const isOfficeB = b.code === 'OFFICE' || /office/i.test(b.name || '');
    if (isOfficeA !== isOfficeB) return isOfficeA ? 1 : -1;

    const isRaghavA = /raghav/i.test(a.name || '');
    const isRaghavB = /raghav/i.test(b.name || '');
    if (isRaghavA !== isRaghavB) return isRaghavA ? -1 : 1;

    const isSanjanaA = /sanjana/i.test(a.name || '');
    const isSanjanaB = /sanjana/i.test(b.name || '');
    if (isSanjanaA !== isSanjanaB) return isSanjanaA ? -1 : 1;

    return (a.name || '').localeCompare(b.name || '');
  });
}


