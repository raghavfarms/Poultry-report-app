import { useEffect, useState } from "react";
import DieselReports from "../components/DieselReports.jsx";
import TransportPage from "./TransportPage.jsx";
import { moduleIconStyles, modules } from "../components/Layout.jsx";

export default function OverviewPage() {
  const [openReport, setOpenReport] = useState(null);
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches,
  );
  const toggle = (slug) =>
    setOpenReport((current) => (current === slug ? null : slug));

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = (event) => setDesktop(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (desktop)
    return (
      <div className="space-y-6">
        <DieselReports compact />
        <TransportPage />
        <section>
          <h2 className="mb-4 text-xl font-black text-slate-900">
            Next report modules
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modules.filter(([slug]) => !["diesel", "transport"].includes(slug)).map(([slug, label, icon]) => (
              <article
                key={slug}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-xl text-lg ${moduleIconStyles[slug]}`}
                  >
                    {icon}
                  </span>
                  <div>
                    <h3 className="font-bold text-slate-800">{label}</h3>
                    <p className="text-xs font-semibold uppercase tracking-wider text-amber-600">
                      Ready for next phase
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );

  return (
    <div className="space-y-3">
      <div className="mb-4">
        <h1 className="text-xl font-black text-slate-900 sm:text-2xl">
          All Reports
        </h1>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          Select a report to open or close it.
        </p>
      </div>
      {modules.map(([slug, label, icon]) => {
        const expanded = openReport === slug;
        const panelId = `report-panel-${slug}`;
        return (
          <section
            key={slug}
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${expanded ? "border-emerald-300" : "border-slate-200"}`}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => toggle(slug)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left hover:bg-emerald-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-600 sm:px-5"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${moduleIconStyles[slug]}`}
              >
                {icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold text-slate-800">
                  {label}
                </span>
                <span
                  className={`block text-[10px] font-bold uppercase tracking-wider ${slug === "diesel" ? "text-emerald-700" : "text-amber-600"}`}
                >
                  {slug === "diesel" ? "Available" : "Ready for next phase"}
                </span>
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                fill="none"
                className={`h-5 w-5 shrink-0 text-slate-500 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              >
                <path
                  d="m5 7.5 5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {expanded && (
              <div
                id={panelId}
                className="border-t border-slate-200 bg-[#f8faf8] p-2 sm:p-4"
              >
                {slug === "diesel" ? (
                  <DieselReports compact showHeading={false} />
                ) : slug === "transport" ? (
                  <TransportPage />
                ) : (
                  <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5 text-center">
                    <h2 className="font-bold text-slate-800">{label}</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      This report is ready for the next development phase.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
