import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { Alert, Spinner, inputClass, compactInputClass, secondaryButton } from '../../components/Ui.jsx';
import { attendancePath, fetchWorkerPhoto } from '../services/adminApi.js';

export function useAttendanceData(path, version = 0) {
  const key = `${path}|${version}`;
  const [state, setState] = useState({ key: '', data: null, error: '', loading: true });
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setState({ key, data: null, error: '', loading: true });
    api(path, { signal: controller.signal }).then((data) => {
      if (!controller.signal.aborted) setState({ key, data, error: '', loading: false });
    }).catch((error) => {
      if (!controller.signal.aborted) setState({ key, data: null, error: error.message, loading: false });
    });
    return () => controller.abort();
  }, [path, key]);
  if (!path) return { data: null, loading: false, error: '' };
  return state.key === key ? state : { data: null, loading: true, error: '' };
}

export function useDebounced(value) {
  const [settled, setSettled] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setSettled(value), 250); return () => clearTimeout(timer); }, [value]);
  return settled;
}

export function LoadState({ state, children }) {
  if (state.loading) return <Spinner />;
  if (state.error) return <Alert>{state.error}</Alert>;
  return children;
}

export function Pager({ pagination, onPage, onLimit }) {
  if (!pagination) return null;
  return <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
    <span className="text-xs sm:text-sm">{pagination.total} records · Page {pagination.page} of {Math.max(1, pagination.pages)}</span>
    <div className="flex flex-wrap items-center gap-2">
      {onLimit && <select aria-label="Rows per page" className={`${inputClass} !min-h-9 !w-20 !py-1 text-xs`} value={pagination.limit} onChange={(e) => onLimit(Number(e.target.value))}>{[25, 50, 100].map((n) => <option key={n}>{n}</option>)}</select>}
      <button type="button" className={`${secondaryButton} !min-h-9 !px-3 !py-1 text-xs`} disabled={pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button>
      <button type="button" className={`${secondaryButton} !min-h-9 !px-3 !py-1 text-xs`} disabled={pagination.page >= pagination.pages} onClick={() => onPage(pagination.page + 1)}>Next</button>
    </div>
  </div>;
}

export function RemoteSelect({
  resource,
  firmId,
  value,
  onChange,
  label,
  selectedLabel,
  required = false,
  supervisor = false,
  searchable = false,
  className = '',
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);
  const state = useAttendanceData(
    firmId
      ? attendancePath(resource, {
          firmId,
          active: true,
          limit: 100,
          ...(searchable && debounced ? { search: debounced } : {}),
          page,
          ...(supervisor ? { isSupervisor: true } : {})
        })
      : null
  );
  const items = state.data?.items || [];
  return (
    <fieldset className={`min-w-0 space-y-0.5 ${className}`}>
      <legend className="text-[11px] font-semibold text-slate-600 leading-tight">
        {label}
        {required ? ' *' : ''}
      </legend>
      {searchable && (
        <input
          aria-label={`Search ${label.toLowerCase()}`}
          className={compactInputClass}
          placeholder="Search…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      )}
      <select
        aria-label={label}
        required={required}
        className={compactInputClass}
        value={value || ''}
        onChange={(e) =>
          onChange(
            e.target.value,
            items.find((item) => item._id === e.target.value)
          )
        }
        disabled={!firmId || state.loading}
      >
        <option value="">
          {state.loading ? 'Loading…' : required ? 'Select an option' : 'None'}
        </option>
        {value && !items.some((item) => item._id === value) && (
          <option value={value}>{selectedLabel || 'Selected record'}</option>
        )}
        {items.map((item) => (
          <option key={item._id} value={item._id}>
            {item.name || `${item.fullName} · ${item.workerCode}`}
          </option>
        ))}
      </select>
      {state.error && <p role="alert" className="text-[10px] text-red-700">{state.error}</p>}
      {!state.loading && !state.error && !items.length && (
        <p className="text-[10px] text-slate-500">No active matches.</p>
      )}
      {state.data?.pagination?.pages > 1 && (
        <div className="flex gap-2 text-[10px] text-slate-500">
          <button type="button" className="hover:underline" disabled={page === 1} onClick={() => setPage(page - 1)}>
            Prev
          </button>
          <span>
            {page}/{state.data.pagination.pages}
          </span>
          <button type="button" className="hover:underline" disabled={page >= state.data.pagination.pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      )}
    </fieldset>
  );
}

export function Dialog({ title, onClose, busy = false, maxWidth = '420px', children }) {
  const ref = useRef(null);
  const mouseDownOutsideRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog && dialog.open) {
        dialog.close();
      }
    };
  }, []);

  const handleMouseDown = (e) => {
    if (e.target === ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const isOutside = (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
      mouseDownOutsideRef.current = isOutside;
    } else {
      mouseDownOutsideRef.current = false;
    }
  };

  const handleClick = (e) => {
    if (busy) return;
    if (e.target === ref.current && mouseDownOutsideRef.current) {
      const rect = ref.current.getBoundingClientRect();
      const isOutside = (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      );
      if (isOutside) {
        onClose();
      }
    }
  };

  const resolvedWidth = maxWidth.startsWith('max-w-')
    ? (maxWidth === 'max-w-xl' ? '576px' : maxWidth === 'max-w-2xl' ? '672px' : maxWidth === 'max-w-3xl' ? '768px' : maxWidth.replace('max-w-[', '').replace(']', ''))
    : maxWidth;

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      style={{ width: `min(${resolvedWidth}, calc(100vw - 1.5rem))`, maxWidth: resolvedWidth }}
      className="attendance-page attendance-dialog m-auto max-h-[92dvh] overflow-y-auto rounded-xl bg-white p-0 shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-xs"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-1.5 sm:px-3.5 sm:py-2">
        <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{title}</h2>
        <button
          type="button"
          className={`${secondaryButton} !min-h-6 !h-6 !px-2 text-[11px] font-semibold rounded-md cursor-pointer`}
          disabled={busy}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div className="p-2.5 sm:p-3">{children}</div>
    </dialog>
  );
}

export function WorkerPhoto({ worker, large = false }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    setUrl('');
    if (!worker.hasPhotograph) return;
    const controller = new AbortController();
    let objectUrl;
    fetchWorkerPhoto(worker._id, controller.signal).then((blob) => {
      if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    }).catch(() => {});
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [worker._id, worker.hasPhotograph, worker.updatedAt]);
  const src = url || (!worker.hasPhotograph ? worker.photographUrl : '');
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-50 font-bold text-emerald-800 ${large ? 'h-24 w-24 text-3xl' : 'h-11 w-11 text-lg'}`}>
    {src ? <img className="h-full w-full object-cover" src={src} alt={`${worker.fullName}'s photograph`} onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : (worker.fullName?.slice(0, 1)?.toUpperCase() || '?')}
  </span>;
}

export const dateTime = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(value)) : 'Present';
export const panelClass = 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5';
export const cellClass = 'px-3 py-3 text-left align-top text-sm';
export function Status({ active }) { return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${active ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{active ? 'Active' : 'Inactive'}</span>; }
