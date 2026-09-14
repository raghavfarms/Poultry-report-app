import { useEffect, useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath } from '../services/adminApi.js';

export default function AuditLogPanel({ firmId, firms = [] }) {
  const [activeFirmId, setActiveFirmId] = useState(firmId || (firms[0]?._id || ''));
  const [actionFilter, setActionFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    if (firmId) setActiveFirmId(firmId);
  }, [firmId]);

  const loadAuditLogs = useCallback(() => {
    if (!activeFirmId) return;
    setLoading(true);
    setError('');

    const params = { firmId: activeFirmId, page, limit: 25 };
    if (actionFilter) params.action = actionFilter;
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    if (search.trim()) params.search = search.trim();

    api(attendancePath('audit-logs', params))
      .then((res) => {
        setData(res);
      })
      .catch((err) => setError(err.message || 'Failed to load audit logs.'))
      .finally(() => setLoading(false));
  }, [activeFirmId, page, actionFilter, startDate, endDate, search]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const items = data?.items || [];
  const pagination = data?.pagination || { page: 1, limit: 25, total: 0, pages: 1 };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {/* Firm Selector */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Firm
            </label>
            <select
              aria-label="Select Firm"
              className={`${inputClass} !min-h-9 !py-1 text-xs font-semibold`}
              value={activeFirmId}
              onChange={(e) => {
                setActiveFirmId(e.target.value);
                setPage(1);
              }}
            >
              {firms.map((f) => (
                <option key={f._id} value={f._id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Action Type
            </label>
            <select
              aria-label="Filter Action Type"
              className={`${inputClass} !min-h-9 !py-1 text-xs font-semibold`}
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Administrative Actions</option>
              <option value="SHED_TRANSFER">Shed Transfer</option>
              <option value="FARM_TRANSFER">Inter-Farm Transfer</option>
              <option value="CORRECTION">Attendance Correction</option>
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              From Date
            </label>
            <input
              type="date"
              aria-label="From Date"
              className={`${inputClass} !min-h-9 !py-1 text-xs font-semibold`}
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* End Date */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              To Date
            </label>
            <input
              type="date"
              aria-label="To Date"
              className={`${inputClass} !min-h-9 !py-1 text-xs font-semibold`}
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Search Worker */}
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Search Worker
            </label>
            <input
              type="text"
              placeholder="Name or Code…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className={`${inputClass} !min-h-9 !py-1 text-xs`}
            />
          </div>
        </div>

        {/* Status indicator & Refresh */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500">
          <span>
            {pagination.total} audit records found · Page {pagination.page} of {Math.max(1, pagination.pages)}
          </span>
          <button
            type="button"
            onClick={loadAuditLogs}
            disabled={loading}
            className={`${secondaryButton} !min-h-9 sm:!min-h-8 !px-3 !py-1 text-xs w-full sm:w-auto`}
          >
            <span className={loading ? 'animate-spin' : ''}>↻</span> Refresh
          </button>
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      {/* Audit Trail Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="py-16 text-center">
            <Spinner label="Loading audit trail…" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-sm font-semibold">No audit logs recorded for this selection.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="attendance-table w-full text-left text-xs min-w-[750px]">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 sticky left-0 z-20 bg-slate-50 border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)] whitespace-nowrap">Timestamp (IST)</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Worker</th>
                  <th className="px-4 py-3">Original Value</th>
                  <th className="px-4 py-3">Corrected / New Value</th>
                  <th className="px-4 py-3">Mandatory Reason</th>
                  <th className="px-4 py-3">Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((log) => {
                  const logDate = new Date(log.createdAt);
                  const formattedTimestamp = logDate.toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  });

                  return (
                    <tr key={log._id} className="hover:bg-slate-50/80 group">
                      <td data-label="Timestamp (IST)" className="px-4 py-3 font-mono text-[11px] text-slate-500 whitespace-nowrap sticky left-0 z-10 bg-white group-hover:bg-slate-50 transition-colors border-r border-slate-200/80 shadow-[1px_0_2px_rgba(0,0,0,0.04)]">
                        {formattedTimestamp}
                      </td>
                      <td data-label="Action" className="px-4 py-3">
                        {log.action === 'SHED_TRANSFER' && (
                          <span className="rounded bg-cyan-100 px-2 py-0.5 text-[10px] font-bold text-cyan-800">
                            SHED TRANSFER
                          </span>
                        )}
                        {log.action === 'FARM_TRANSFER' && (
                          <span className="rounded bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-800">
                            FARM TRANSFER
                          </span>
                        )}
                        {log.action === 'CORRECTION' && (
                          <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            CORRECTION
                          </span>
                        )}
                      </td>
                      <td data-label="Worker" className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                        <div>
                          <p>{log.workerNameSnapshot || '—'}</p>
                          <p className="text-[10px] font-normal text-slate-400">{log.workerCodeSnapshot || ''}</p>
                        </div>
                      </td>
                      <td data-label="Original value" className="px-4 py-3 text-slate-600 max-w-xs">
                        {log.action.includes('TRANSFER') ? (
                          <span className="text-slate-600">
                            {log.previousValue?.workLocationName || '—'}
                          </span>
                        ) : log.previousValue ? (
                          <span className="font-mono text-[11px]">
                            {log.previousValue.dutyIn ? new Date(log.previousValue.dutyIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'} →{' '}
                            {log.previousValue.dutyOut ? new Date(log.previousValue.dutyOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                          </span>
                        ) : (
                          <span className="text-slate-400">None (New Entry)</span>
                        )}
                      </td>
                      <td data-label="New value" className="px-4 py-3 font-semibold text-slate-800 max-w-xs">
                        {log.action.includes('TRANSFER') ? (
                          <span className="text-emerald-800">
                            {log.newValue?.workLocationName || '—'}
                          </span>
                        ) : log.newValue ? (
                          <span className="font-mono text-[11px] text-emerald-800">
                            {log.newValue.dutyIn ? new Date(log.newValue.dutyIn).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'} →{' '}
                            {log.newValue.dutyOut ? new Date(log.newValue.dutyOut).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td data-label="Reason" className="px-4 py-3 text-slate-700 max-w-sm">
                        <span className="italic">"{log.reason}"</span>
                      </td>
                      <td data-label="Admin" className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        <div>
                          <p className="font-semibold">{log.performedByName}</p>
                          <p className="text-[10px] text-slate-400 capitalize">{log.performedByRole}</p>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {pagination.pages > 1 && (
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between border-t border-slate-100 p-3 text-xs text-slate-600">
            <span>
              Page {pagination.page} of {pagination.pages}
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                className={`${secondaryButton} !min-h-9 flex-1 sm:flex-initial`}
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className={`${secondaryButton} !min-h-9 flex-1 sm:flex-initial`}
                disabled={pagination.page >= pagination.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

