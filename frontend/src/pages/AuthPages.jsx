import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Alert, Field, inputClass, primaryButton } from '../components/Ui.jsx';

function AuthShell({ title, subtitle, children }) {
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-800 to-lime-800 p-4"><section className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Poultry Reporting System</p><h1 className="mt-3 text-2xl font-bold text-slate-900">{title}</h1><p className="mt-1 text-sm text-slate-500">{subtitle}</p><div className="mt-6">{children}</div></section></main>;
}

function useAccountForm() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const update = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  return { form, setForm, update };
}

export function LoginPage() {
  const { user, acceptSession } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [setupRequired, setSetupRequired] = useState(false);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/auth/setup-status').then((data) => setSetupRequired(data.setupRequired)).catch(() => {}); }, []);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { acceptSession(await api('/auth/login', { method: 'POST', body: JSON.stringify(form) })); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <AuthShell title="Welcome back" subtitle="Enter today’s farm data or review reports."><form onSubmit={submit} className="grid gap-4"><Alert>{error}</Alert><Field label="Email"><input required type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field><Field label="Password"><input required type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field><button disabled={busy} className={primaryButton}>{busy ? 'Signing in…' : 'Sign in'}</button></form><div className="mt-5 space-y-2 text-center text-sm text-slate-600"><p>New labour? <Link className="font-semibold text-emerald-700" to="/register">Create an account</Link></p>{setupRequired && <p>First use? <Link className="font-semibold text-amber-700" to="/setup">Set up the admin</Link></p>}</div></AuthShell>;
}

export function RegisterPage() {
  const { user, acceptSession } = useAuth(); const navigate = useNavigate();
  const { form, update } = useAccountForm(); const [firms, setFirms] = useState([]); const [selected, setSelected] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api('/auth/registration-firms').then((data) => setFirms(data.firms)).catch((err) => setError(err.message)); }, []);
  if (user) return <Navigate to="/" replace />;
  const toggle = (id) => setSelected((values) => values.includes(id) ? values.filter((item) => item !== id) : [...values, id]);
  const submit = async (event) => { event.preventDefault(); setError(''); if (form.password !== form.confirm) return setError('Passwords do not match.'); if (!selected.length) return setError('Select at least one firm.'); setBusy(true); try { acceptSession(await api('/auth/register', { method: 'POST', body: JSON.stringify({ ...form, firmIds: selected }) })); navigate('/'); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <AuthShell title="Labour registration" subtitle="Choose one firm or both firms."><form onSubmit={submit} className="grid gap-4"><Alert>{error}</Alert><Field label="Name"><input required name="name" className={inputClass} value={form.name} onChange={update} /></Field><Field label="Email"><input required name="email" type="email" className={inputClass} value={form.email} onChange={update} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Password"><input required minLength="6" name="password" type="password" className={inputClass} value={form.password} onChange={update} /></Field><Field label="Confirm"><input required minLength="6" name="confirm" type="password" className={inputClass} value={form.confirm} onChange={update} /></Field></div><fieldset><legend className="mb-2 text-sm font-medium text-slate-700">Firm(s)</legend><div className="grid gap-2">{firms.map((firm) => <label key={firm._id} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 ${selected.includes(firm._id) ? 'border-emerald-600 bg-emerald-50' : 'border-slate-300'}`}><input type="checkbox" checked={selected.includes(firm._id)} onChange={() => toggle(firm._id)} className="h-5 w-5 accent-emerald-700" /><span className="font-medium">{firm.name}</span></label>)}</div></fieldset><button disabled={busy || !firms.length} className={primaryButton}>{busy ? 'Creating…' : 'Create labour account'}</button></form><p className="mt-5 text-center text-sm"><Link className="font-semibold text-emerald-700" to="/login">Back to login</Link></p></AuthShell>;
}

export function SetupPage() {
  const { user, acceptSession } = useAuth(); const { form, update } = useAccountForm(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [allowed, setAllowed] = useState(null);
  useEffect(() => { api('/auth/setup-status').then((data) => setAllowed(data.setupRequired)).catch((err) => setError(err.message)); }, []);
  if (user) return <Navigate to="/" replace />;
  const submit = async (event) => { event.preventDefault(); setError(''); if (form.password !== form.confirm) return setError('Passwords do not match.'); setBusy(true); try { acceptSession(await api('/auth/setup-admin', { method: 'POST', body: JSON.stringify(form) })); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  return <AuthShell title="One-time admin setup" subtitle="This creates Raghav and Sanjana firms. Assets remain empty until the admin adds them.">{allowed === false ? <><Alert type="success">Setup is already complete.</Alert><Link className={`${primaryButton} mt-4 w-full`} to="/login">Go to login</Link></> : <form onSubmit={submit} className="grid gap-4"><Alert>{error}</Alert><Field label="Admin name"><input required name="name" className={inputClass} value={form.name} onChange={update} /></Field><Field label="Admin email"><input required name="email" type="email" className={inputClass} value={form.email} onChange={update} /></Field><div className="grid grid-cols-2 gap-3"><Field label="Password"><input required minLength="6" name="password" type="password" className={inputClass} value={form.password} onChange={update} /></Field><Field label="Confirm"><input required minLength="6" name="confirm" type="password" className={inputClass} value={form.confirm} onChange={update} /></Field></div><button disabled={busy || allowed === null} className={primaryButton}>{busy ? 'Setting up…' : 'Create admin & firms'}</button></form>}</AuthShell>;
}

