import { useState } from 'react';
import { LoadState, Pager, useAttendanceData } from './AdminUi.jsx';
import { attendancePath } from '../services/adminApi.js';

function formatInstant(value) {
  return value ? new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value)) : 'Not recorded';
}

export default function AttendanceEditHistory({ workerId, date }) {
  const [page, setPage] = useState(1);
  const state = useAttendanceData(attendancePath('audit-logs', {
    workerId, attendanceDate: date, entityType: 'ATTENDANCE_SESSION',
    action: 'CORRECTION', page, limit: 25,
  }));
  return <details className="mt-2 border-t border-slate-200 pt-2 text-xs">
    <summary className="cursor-pointer font-semibold text-slate-600">
      Edit history {state.loading ? '(loading...)' : state.error ? '(unavailable)' : '(' + (state.data?.pagination?.total ?? 0) + ' edits)'}
    </summary>
    <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
    <LoadState state={state}>
      <p className="text-xs text-slate-600">Total edits: <strong>{state.data?.pagination?.total ?? 0}</strong></p>
      {(state.data?.items || []).map((entry) => <details key={entry._id} className="rounded-lg border border-slate-200 p-2 text-xs">
        <summary className="cursor-pointer font-semibold text-slate-700">
          {entry.performedByName} ({(entry.performedByRole || 'staff').replaceAll('_', ' ')}) — {formatInstant(entry.createdAt)}
        </summary>
        <div className="mt-2 space-y-1 text-slate-600">
          <p>IN: {formatInstant(entry.previousValue?.dutyIn)} → {formatInstant(entry.newValue?.dutyIn)}</p>
          <p>OUT: {formatInstant(entry.previousValue?.dutyOut)} → {formatInstant(entry.newValue?.dutyOut)}</p>
          <p>Worked minutes: {entry.previousValue?.workedMinutes ?? 0} → {entry.newValue?.workedMinutes ?? 0}</p>
          <p className="whitespace-pre-wrap break-words">Reason: {entry.reason}</p>
        </div>
      </details>)}
      {state.data?.pagination?.pages > 1 && <Pager pagination={state.data.pagination} onPage={setPage} />}
    </LoadState>
    </div>
  </details>;
}
