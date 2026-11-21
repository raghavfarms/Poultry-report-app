/**
 * Attendance Punctuality Helper (Strictly Read-Only Analysis)
 * Determines automated YES / NO for:
 * - Question 1: Morning Duty In <= 8:30 AM IST
 * - Question 3: Lunch Return In <= 1:10 PM IST (13:10)
 */

export function evaluateDutyInPunctuality(dutyInDate) {
  if (!dutyInDate) {
    return {
      answer: 'NO',
      timeText: 'No Punch',
      isOnTime: false,
    };
  }

  const d = new Date(dutyInDate);
  const timeFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const totalMinutes = h * 60 + m;

  // Threshold: 8:30 AM IST = 510 minutes
  const isOnTime = totalMinutes <= 510;

  return {
    answer: isOnTime ? 'YES' : 'NO',
    timeText: timeFormatted,
    isOnTime,
  };
}

export function evaluateLunchInPunctuality(lunchInDate, lunchOutDate) {
  // If worker did not take a recorded lunch break, default to on-time (no lunch delay violation)
  if (!lunchInDate) {
    if (lunchOutDate) {
      // Still on lunch / not returned yet
      return {
        answer: 'NO',
        timeText: 'Out on Lunch',
        isOnTime: false,
      };
    }
    return {
      answer: 'YES',
      timeText: 'No Lunch Punch',
      isOnTime: true,
    };
  }

  const d = new Date(lunchInDate);
  const timeFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);
  const totalMinutes = h * 60 + m;

  // Threshold: 1:10 PM IST (13:10) = 790 minutes
  const isOnTime = totalMinutes <= 790;

  return {
    answer: isOnTime ? 'YES' : 'NO',
    timeText: timeFormatted,
    isOnTime,
  };
}
