import React, { useState, useMemo, useEffect } from 'react';
import {
  acceptMedicineTransfer,
  rejectMedicineTransfer,
  cancelMedicineTransfer,
} from '../api/transferApi.js';

export default function MedicineTransferInboxModal({
  isOpen,
  onClose,
  pendingTransfers = [],
  currentFarmId = '',
  firms = [],
  onActionComplete,
}) {
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [loadingId, setLoadingId] = useState(null);
  const [actionError, setActionError] = useState('');

  // Active view tab: 'incoming' (stock to accept) vs 'outgoing' (stock sent waiting for acceptance)
  const [activeTab, setActiveTab] = useState('incoming');

  // Categorize transfers based on currentFarmId
  const { incomingList, outgoingList } = useMemo(() => {
    if (!currentFarmId) {
      return {
        incomingList: pendingTransfers,
        outgoingList: pendingTransfers,
      };
    }
    const farmStr = currentFarmId.toString();
    const inc = pendingTransfers.filter(
      (t) => (t.toFarm?._id || t.toFarm)?.toString() === farmStr
    );
    const out = pendingTransfers.filter(
      (t) => (t.fromFarm?._id || t.fromFarm)?.toString() === farmStr
    );
    return { incomingList: inc, outgoingList: out };
  }, [pendingTransfers, currentFarmId]);

  // If user selected farm has 0 incoming but has outgoing, or vice versa, default sensibly
  useEffect(() => {
    if (currentFarmId) {
      if (incomingList.length === 0 && outgoingList.length > 0) {
        setActiveTab('outgoing');
      } else {
        setActiveTab('incoming');
      }
    } else {
      setActiveTab('all');
    }
  }, [currentFarmId, incomingList.length, outgoingList.length]);

  if (!isOpen) return null;

  const currentFarmName =
    firms.find((f) => f._id === currentFarmId)?.name || 'This Farm';

  const displayedList =
    activeTab === 'incoming'
      ? incomingList
      : activeTab === 'outgoing'
      ? outgoingList
      : pendingTransfers;

  const handleAccept = async (id) => {
    setActionError('');
    setLoadingId(id);
    try {
      await acceptMedicineTransfer(id);
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err.message || 'Failed to accept transfer.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleReject = async (id) => {
    setActionError('');
    setLoadingId(id);
    try {
      await rejectMedicineTransfer(id, rejectReason);
      setRejectingId(null);
      setRejectReason('');
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err.message || 'Failed to decline transfer.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleCancel = async (id) => {
    if (
      !window.confirm(
        'Cancel this transfer request? Stock hold will be immediately released back to sender.'
      )
    ) {
      return;
    }
    setActionError('');
    setLoadingId(id);
    try {
      await cancelMedicineTransfer(id);
      if (onActionComplete) onActionComplete();
    } catch (err) {
      setActionError(err.message || 'Failed to cancel transfer.');
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      {/* Compact width matching transfer modal (max-w-[420px]) */}
      <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[88vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center px-3.5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <div>
              <h2 className="text-xs font-black tracking-tight">Transfer Requests</h2>
              <p className="text-[9px] text-amber-100 font-medium">
                {currentFarmId ? `Filtered for ${currentFarmName}` : 'All pending farm transfers'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white p-1 rounded-lg text-sm font-bold leading-none cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher: Incoming vs Outgoing */}
        {currentFarmId && (
          <div className="flex p-1.5 bg-slate-100 border-b border-slate-200/80 gap-1 text-[11px] font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('incoming')}
              className={`flex-1 py-1 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'incoming'
                  ? 'bg-white text-emerald-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📥 Incoming</span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded-full ${
                  activeTab === 'incoming'
                    ? 'bg-emerald-100 text-emerald-800 font-black'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {incomingList.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('outgoing')}
              className={`flex-1 py-1 rounded-lg transition flex items-center justify-center gap-1 cursor-pointer ${
                activeTab === 'outgoing'
                  ? 'bg-white text-blue-800 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>📤 Outgoing</span>
              <span
                className={`text-[9px] px-1 py-0.2 rounded-full ${
                  activeTab === 'outgoing'
                    ? 'bg-blue-100 text-blue-800 font-black'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {outgoingList.length}
              </span>
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-3 overflow-y-auto space-y-2 flex-1 text-xs">
          {actionError && (
            <div className="p-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 animate-shake">
              <span>⚠️</span>
              <span>{actionError}</span>
            </div>
          )}

          {displayedList.length === 0 ? (
            <div className="text-center py-8 text-slate-400 space-y-1">
              <span className="text-2xl block">📭</span>
              <p className="font-bold text-xs text-slate-700">
                {activeTab === 'incoming'
                  ? `No incoming stock for ${currentFarmName}`
                  : activeTab === 'outgoing'
                  ? `No outgoing requests from ${currentFarmName}`
                  : 'No pending transfer requests'}
              </p>
              <p className="text-[10px]">
                {activeTab === 'incoming'
                  ? 'When another farm transfers medicine to you, it will appear here for acceptance.'
                  : 'All transfers are currently settled.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayedList.map((t) => {
                const toId = (t.toFarm?._id || t.toFarm)?.toString();
                const fromId = (t.fromFarm?._id || t.fromFarm)?.toString();
                const activeId = currentFarmId ? currentFarmId.toString() : '';

                // Is the user looking at an incoming transfer (currentFarm is receiver)?
                const isIncoming = activeId ? toId === activeId : false;
                // Is the user looking at an outgoing transfer (currentFarm is sender)?
                const isOutgoing = activeId ? fromId === activeId : false;

                const isBusy = loadingId === t._id;

                return (
                  <div
                    key={t._id}
                    className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 hover:shadow-2xs transition"
                  >
                    {/* Top Row: Direction & Ref */}
                    <div className="flex justify-between items-start gap-1.5">
                      <div>
                        <div className="flex items-center gap-1 font-bold text-[11px]">
                          <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-blue-700">
                            🏢 {t.fromFarm?.name || 'Sender'}
                          </span>
                          <span className="text-slate-400 text-xs">➔</span>
                          <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-emerald-700">
                            🏢 {t.toFarm?.name || 'Receiver'}
                          </span>
                        </div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                          {t.transferNumber} • By {t.requestedByName || 'Admin'}
                        </div>
                      </div>

                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 rounded-full font-bold text-[9px] shrink-0">
                        🔒 ON HOLD
                      </span>
                    </div>

                    {/* Medicine & Qty Pill */}
                    <div className="bg-white p-2 rounded-lg border border-slate-200/90 flex justify-between items-center">
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {t.medicine?.name}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <span className="font-mono bg-slate-100 px-1 rounded border border-slate-200">
                            #{t.batchNumber}
                          </span>
                          <span>Exp: {t.expiryDate}</span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-sm font-black text-indigo-700">{t.quantity}</span>{' '}
                        <span className="text-[10px] font-semibold text-slate-500">{t.unit}</span>
                      </div>
                    </div>

                    {/* Carried By */}
                    {t.transportDetails?.personName && (
                      <div className="text-[10px] text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                        <span>👤 Carried By: <strong>{t.transportDetails.personName}</strong></span>
                      </div>
                    )}

                    {/* Decline Reason Expandable Box */}
                    {rejectingId === t._id && (
                      <div className="bg-rose-50 border border-rose-200 p-2 rounded-lg space-y-1.5 animate-in fade-in">
                        <label className="block text-[9px] font-bold uppercase text-rose-800">
                          Decline Reason (Optional):
                        </label>
                        <input
                          type="text"
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="e.g. Broken seal, wrong quantity..."
                          className="w-full h-7 px-2 bg-white border border-rose-300 rounded text-xs text-rose-900 focus:outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason('');
                            }}
                            className="px-2 py-0.5 text-[10px] text-slate-600 bg-white border border-slate-200 rounded font-semibold cursor-pointer"
                          >
                            Back
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(t._id)}
                            disabled={isBusy}
                            className="px-2.5 py-0.5 text-[10px] bg-rose-600 hover:bg-rose-700 text-white rounded font-bold shadow-2xs cursor-pointer"
                          >
                            {isBusy ? 'Declining...' : 'Confirm Decline'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons Row */}
                    {rejectingId !== t._id && (
                      <div className="pt-1 border-t border-slate-200/80 flex items-center justify-between gap-1.5">
                        {/* CASE 1: SENDER FARM (e.g. Raghav sent to Sanjana) */}
                        {isOutgoing ? (
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              ⏳ Awaiting {t.toFarm?.name || 'Receiver'} to accept
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCancel(t._id)}
                              disabled={isBusy}
                              className="text-[10px] text-rose-600 hover:text-rose-800 font-bold hover:underline cursor-pointer"
                            >
                              Cancel Request
                            </button>
                          </div>
                        ) : isIncoming ? (
                          /* CASE 2: RECEIVER FARM (e.g. Sanjana receiving from Raghav) */
                          <div className="flex items-center justify-end w-full gap-2">
                            <button
                              type="button"
                              onClick={() => setRejectingId(t._id)}
                              disabled={isBusy}
                              className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer transition"
                            >
                              ❌ Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAccept(t._id)}
                              disabled={isBusy}
                              className="px-3 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-2xs cursor-pointer transition flex items-center gap-1"
                            >
                              {isBusy ? 'Saving...' : '✅ Accept Stock'}
                            </button>
                          </div>
                        ) : (
                          /* CASE 3: ALL FARMS / SYSTEM ADMIN OVERVIEW */
                          <div className="flex items-center justify-between w-full">
                            <button
                              type="button"
                              onClick={() => handleCancel(t._id)}
                              disabled={isBusy}
                              className="text-[10px] text-slate-500 hover:text-rose-700 font-bold hover:underline cursor-pointer"
                              title="Sender cancel"
                            >
                              Cancel
                            </button>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setRejectingId(t._id)}
                                disabled={isBusy}
                                className="px-2 py-0.5 text-[10px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded cursor-pointer"
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAccept(t._id)}
                                disabled={isBusy}
                                className="px-2.5 py-0.5 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded shadow-2xs cursor-pointer flex items-center gap-1"
                              >
                                {isBusy ? '...' : `Accept (${t.toFarm?.name || 'Receiver'})`}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
