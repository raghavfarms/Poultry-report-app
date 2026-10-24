import { addDays, todayUtc } from '../utils/date.js';

export function canEditDieselEntry({ date, isMissing = false, role, referenceDate = todayUtc() }) {
  if (isMissing) return false;
  if (['admin', 'developer'].includes(role)) return true;
  if (!date) return false;

  const minDate = addDays(referenceDate, -1);
  return date >= minDate && date <= referenceDate;
}

