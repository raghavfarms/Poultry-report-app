export function Spinner({ label = 'Loading…' }) {
  return <div className="flex min-h-32 items-center justify-center gap-3 text-sm text-slate-500"><span className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-700 border-t-transparent" />{label}</div>;
}

export function Alert({ type = 'error', children }) {
  const style = type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700';
  return children ? <div className={`rounded-xl border px-4 py-3 text-sm ${style}`}>{children}</div> : null;
}

export function Field({ label, hint, children }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}{hint && <span className="text-xs font-normal text-slate-500">{hint}</span>}</label>;
}

export const inputClass = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500';
export const primaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryButton = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';

