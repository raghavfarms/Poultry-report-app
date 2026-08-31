import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export const modules = [
  ['diesel', 'Diesel Consumption', '⛽'], ['raw-material', 'Raw Material', '▦'],
  ['feed-production', 'Feed Production', '◫'], ['bird-stock', 'Bird Stock', '🐔'],
  ['egg-stock', 'Egg Stock', '🥚'], ['hatching-egg', 'Hatching Egg Summary', '◉'],
  ['medicine', 'Medicine Requirement', '✚'], ['packing', 'Packing Material', '□'],
  ['vermicompost', 'Vermicompost', '♻'], ['attendance', 'Attendance', '◌'],
  ['solar', 'Solar Status', '☀'], ['vaccination', 'Vaccination Status', '✓'],
];

export const moduleIconStyles = {
  diesel: 'bg-red-100 text-red-700',
  'raw-material': 'bg-sky-100 text-sky-700',
  'feed-production': 'bg-amber-100 text-amber-700',
  'bird-stock': 'bg-orange-100 text-orange-700',
  'egg-stock': 'bg-yellow-100 text-yellow-700',
  'hatching-egg': 'bg-indigo-100 text-indigo-700',
  medicine: 'bg-rose-100 text-rose-700',
  packing: 'bg-violet-100 text-violet-700',
  vermicompost: 'bg-lime-100 text-lime-700',
  attendance: 'bg-cyan-100 text-cyan-700',
  solar: 'bg-yellow-100 text-yellow-700',
  vaccination: 'bg-emerald-100 text-emerald-700',
};

function Sidebar({ open, close }) {
  const { user, logout } = useAuth();
  const linkClass = ({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${isActive ? 'bg-emerald-800 font-semibold text-white' : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-900'}`;
  return <>
    {open && <button aria-label="Close menu" onClick={close} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white p-4 transition-transform lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="mb-5 flex items-center justify-between px-2">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Raghav Farms</p><h1 className="mt-1 text-lg font-bold text-slate-900">Poultry Reports</h1></div>
        <button onClick={close} className="rounded-lg p-2 text-slate-500 lg:hidden">✕</button>
      </div>
      <nav className="report-scroll flex-1 space-y-1 overflow-y-auto pr-1" onClick={close}>
        <NavLink to="/" end className={linkClass}><span>⌂</span>All Reports</NavLink>
        <p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Report sections</p>
        {modules.map(([slug, label, icon]) => <NavLink key={slug} to={`/reports/${slug}`} className={linkClass}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm ${moduleIconStyles[slug]}`}>{icon}</span>{label}</NavLink>)}
        {user.role === 'admin' && <><p className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Administration</p><NavLink to="/admin/assets" className={linkClass}><span>⚙</span>Firms & Assets</NavLink></>}
      </nav>
      <div className="mt-4 border-t border-slate-200 px-2 pt-4">
        <p className="truncate text-sm font-semibold text-slate-800">{user.name}</p><p className="text-xs capitalize text-slate-500">{user.role}</p>
        <button onClick={logout} className="mt-3 text-sm font-semibold text-red-600">Log out</button>
      </div>
    </aside>
  </>;
}

export default function Layout() {
  const [open, setOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);
  return <div className="min-h-screen bg-[#f4f7f4]"><Sidebar open={open} close={() => setOpen(false)} /><header className="sticky top-0 z-20 flex h-12 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:ml-72 lg:px-5"><button onClick={() => setOpen(true)} className="mr-3 rounded-lg border border-slate-200 px-2 py-1.5 lg:hidden">☰</button><img src="/favicon.svg?v=2" alt="" className="mr-2 h-7 w-7 shrink-0 object-contain" /><span className="text-sm font-semibold text-slate-600">Daily farm reporting</span></header><main className="p-3 sm:p-4 lg:ml-72 lg:p-5"><Outlet /></main></div>;
}
