import { Link, useParams } from 'react-router-dom';
import { modules } from '../components/Layout.jsx';
import { primaryButton } from '../components/Ui.jsx';
export default function ComingSoonPage() { const { slug } = useParams(); const item = modules.find(([key]) => key === slug); if (!item) return <p>Report not found.</p>; return <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="text-5xl">{item[2]}</div><h1 className="mt-4 text-2xl font-black text-slate-900">{item[1]}</h1><p className="mx-auto mt-3 max-w-lg text-slate-500">This module is already included in navigation and can be implemented next without changing the diesel module or user permissions.</p><Link to="/" className={`${primaryButton} mt-6`}>Back to all reports</Link></section>; }

