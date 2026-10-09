import React, { useState, useEffect } from 'react';
import { fetchMedicineTransfers } from '../api/transferApi.js';

export default function MedicineTransferAuditReport({
  firms = [],
  selectedFarm = '',
  onOpenTransferModal,
}) {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [farmFilter, setFarmFilter] = useState(selectedFarm || '');
  const [directionFilter, setDirectionFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (selectedFarm) setFarmFilter(selectedFarm);
  }, [selectedFarm]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      try {
        const res = await fetchMedicineTransfers({
          status: statusFilter,
          farm: farmFilter,
          direction: directionFilter,
          search: searchTerm,
          limit: 100,
        });
        if (isMounted) {
          setTransfers(res.transfers || []);
        }
      } catch (err) {
        console.error('Failed to load transfers audit:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [statusFilter, farmFilter, directionFilter, searchTerm, refreshKey]);

  return (
    <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Top Controls Bar */}
      <div className="p-3 sm:p-4 border-b border-slate-100 space-y-2.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm sm:text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5">
              <span>📋</span> Inter-Firm Transfer Audit Ledger
            </h2>
            <p className="text-[11px] text-slate-500">
              Complete history of transferred medicine stock across farms
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="p-1.5 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold transition cursor-pointer"
              title="Refresh"
            >
              🔄
            </button>
            <button
              type="button"
              onClick={onOpenTransferModal}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition flex items-center gap-1 cursor-pointer shrink-0"
            >
              <span>➕</span>
              <span>New Transfer</span>
            </button>
          </div>
        </div>

        {/* Filter Pills & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          {/* Status Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {[
              { label: 'All Transfers', val: '' },
              { label: '⏳ Pending', val: 'PENDING' },
              { label: '✅ Accepted', val: 'ACCEPTED' },
              { label: '❌ Declined', val: 'REJECTED' },
              { label: '🚫 Cancelled', val: 'CANCELLED' },
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                onClick={() => setStatusFilter(p.val)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 cursor-pointer border ${
                  statusFilter === p.val
                    ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {firms.length > 0 && (
              <select
                value={farmFilter}
                onChange={(e) => {
                  setFarmFilter(e.target.value);
                  if (!e.target.value) setDirectionFilter('');
                }}
                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">All Farms</option>
                {firms.map((f) => (
                  <option key={f._id} value={f._id}>
                    🏢 {f.name}
                  </option>
                ))}
              </select>
            )}

            {farmFilter && (
              <select
                value={directionFilter}
                onChange={(e) => setDirectionFilter(e.target.value)}
                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shrink-0"
              >
                <option value="">All (In & Out)</option>
                <option value="incoming">📥 Incoming Only</option>
                <option value="outgoing">📤 Outgoing Only</option>
              </select>
            )}

            {/* Search box */}
            <div className="relative flex-1 sm:w-64">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search ref, medicine, batch..."
                className="w-full h-8 pl-7 pr-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="absolute left-2 top-2 text-slate-400 text-xs">🔍</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-xs font-medium space-y-1">
          <span className="animate-spin text-xl block">⏳</span>
          <span>Loading transfer audit records...</span>
        </div>
      ) : transfers.length === 0 ? (
        <div className="py-12 text-center text-slate-400 space-y-1">
          <span className="text-3xl block">📑</span>
          <p className="font-bold text-xs text-slate-600">No transfer records found</p>
          <p className="text-[11px]">
            {farmFilter
              ? 'No transfer records match the selected farm and filter settings.'
              : 'Transfers across farms will appear here.'}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-2.5 px-3">Date & Time</th>
                  <th className="py-2.5 px-3">Direction</th>
                  <th className="py-2.5 px-3">Medicine & Batch</th>
                  <th className="py-2.5 px-3 text-right">Transfer Qty</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3">Requested By</th>
                  <th className="py-2.5 px-3">Actioned By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t) => {
                  const statusColors = {
                    PENDING: 'bg-amber-100 text-amber-900 border-amber-200',
                    ACCEPTED: 'bg-emerald-100 text-emerald-900 border-emerald-200',
                    REJECTED: 'bg-rose-100 text-rose-900 border-rose-200',
                    CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
                  };

                  return (
                    <tr key={t._id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date & Ref */}
                      <td className="py-2.5 px-3">
                        <div className="font-mono font-bold text-slate-900 text-xs">{t.transferNumber}</div>
                        <div className="text-[10px] text-slate-600 font-semibold mt-0.5">
                          {new Date(t.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </div>
                        <div className="text-[9px] text-slate-400">
                          {new Date(t.createdAt).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </div>
                      </td>

                      {/* Direction */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1 font-bold text-[11px]">
                          <span className="text-blue-700">{t.fromFarm?.name}</span>
                          <span className="text-slate-400 text-xs">➔</span>
                          <span className="text-emerald-700">{t.toFarm?.name}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {farmFilter && (
                            (t.toFarm?._id || t.toFarm)?.toString() === farmFilter.toString() ? (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                📥 INWARD
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                                📤 OUTWARD
                              </span>
                            )
                          )}
                          {t.transportDetails?.personName && (
                            <span className="text-[9px] text-slate-400">
                              👤 {t.transportDetails.personName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Medicine & Batch */}
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-slate-900 text-xs">{t.medicine?.name}</div>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                          <span className="font-mono bg-slate-100 px-1 py-0.2 rounded border border-slate-200">
                            #{t.batchNumber}
                          </span>
                          <span>Exp: {t.expiryDate}</span>
                        </div>
                      </td>

                      {/* Transfer Qty */}
                      <td className="py-2.5 px-3 text-right">
                        <span className="font-black text-sm text-slate-900">{t.quantity}</span>{' '}
                        <span className="text-[10px] font-semibold text-slate-500">{t.unit}</span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            statusColors[t.status] || 'bg-slate-100'
                          }`}
                        >
                          {t.status === 'PENDING'
                            ? '⏳ PENDING'
                            : t.status === 'ACCEPTED'
                            ? '✅ ACCEPTED'
                            : t.status === 'REJECTED'
                            ? '❌ DECLINED'
                            : '🚫 CANCELLED'}
                        </span>
                        {t.rejectionReason && (
                          <div className="text-[9px] text-rose-600 italic mt-0.5 max-w-[120px] truncate mx-auto" title={t.rejectionReason}>
                            "{t.rejectionReason}"
                          </div>
                        )}
                      </td>

                      {/* Requested By */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        <div className="font-medium text-slate-800">{t.requestedByName || 'Admin'}</div>
                      </td>

                      {/* Actioned By */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {t.actionedByName ? (
                          <div>
                            <div className="font-medium text-slate-800">{t.actionedByName}</div>
                            {t.actionedAt && (
                              <div className="text-[9px] text-slate-400">
                                {new Date(t.actionedAt).toLocaleDateString('en-IN', {
                                  day: '2-digit',
                                  month: 'short',
                                })}{' '}
                                •{' '}
                                {new Date(t.actionedAt).toLocaleTimeString('en-IN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: true,
                                })}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">Awaiting response</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Responsive Cards View */}
          <div className="md:hidden divide-y divide-slate-100">
            {transfers.map((t) => {
              const statusColors = {
                PENDING: 'bg-amber-100 text-amber-900 border-amber-200',
                ACCEPTED: 'bg-emerald-100 text-emerald-900 border-emerald-200',
                REJECTED: 'bg-rose-100 text-rose-900 border-rose-200',
                CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
              };

              return (
                <div key={t._id} className="p-3 space-y-2 text-xs">
                  {/* Top Bar: Ref & Status */}
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono font-bold text-slate-900 text-xs block">
                        {t.transferNumber}
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">
                        {new Date(t.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}{' '}
                        •{' '}
                        {new Date(t.createdAt).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        statusColors[t.status] || 'bg-slate-100'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>

                  {/* Direction Card */}
                  <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between text-[11px] font-bold">
                    <span className="text-blue-700">🏢 {t.fromFarm?.name}</span>
                    <div className="flex items-center gap-1">
                      {farmFilter && (
                        (t.toFarm?._id || t.toFarm)?.toString() === farmFilter.toString() ? (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                            📥 INWARD
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-blue-100 text-blue-800 border border-blue-200">
                            📤 OUTWARD
                          </span>
                        )
                      )}
                      <span className="text-slate-400">➔</span>
                    </div>
                    <span className="text-emerald-700">🏢 {t.toFarm?.name}</span>
                  </div>

                  {/* Medicine & Qty */}
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{t.medicine?.name}</div>
                      <div className="text-[10px] text-slate-500">
                        Batch #{t.batchNumber} • Exp: {t.expiryDate}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-black text-sm text-indigo-700">{t.quantity}</span>{' '}
                      <span className="text-[10px] font-semibold text-slate-500">{t.unit}</span>
                    </div>
                  </div>

                  {/* Rejection reason if any */}
                  {t.rejectionReason && (
                    <div className="text-[10px] text-rose-700 bg-rose-50 p-1.5 rounded border border-rose-200">
                      Reason: "{t.rejectionReason}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

