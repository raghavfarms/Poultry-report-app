// Use only for successfully recorded events in authorized attendance reports.
// Pass the backend's attendanceLocationReport result, not a browser-supplied message.
export default function AttendanceLocationNotice({ locationReport }) {
  const warning = locationReport?.needsAttention !== false;
  return (
    <span className={`inline-block rounded-lg px-2 py-1 text-xs ${warning ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-800'}`}>
      {locationReport?.message || 'Attendance marked without location — no location information received.'}
    </span>
  );
}
