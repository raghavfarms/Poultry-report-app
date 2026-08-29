import DieselReports from '../components/DieselReports.jsx';
import { moduleIconStyles, modules } from '../components/Layout.jsx';

export default function OverviewPage() {
  return <div className="space-y-6"><DieselReports compact /><section><h2 className="mb-4 text-xl font-black text-slate-900">Next report modules</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{modules.slice(1).map(([slug,label,icon]) => <article key={slug} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${moduleIconStyles[slug]}`}>{icon}</span><div><h3 className="font-bold text-slate-800">{label}</h3><p className="text-xs font-semibold uppercase tracking-wider text-amber-600">Ready for next phase</p></div></div></article>)}</div></section></div>;
}
