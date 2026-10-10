import { useEffect, useState } from "react";
import DieselReports from "../components/DieselReports.jsx";
import TransportPage from "./TransportPage.jsx";
import AttendanceReportPage from "../attendance/pages/AttendanceReportPage.jsx";
import WorkerAttendancePortal from "../attendance/pages/WorkerAttendancePortal.jsx";
import MedicineReportPage from "../medicine/pages/MedicineReportPage.jsx";
import { moduleIconStyles, modules } from "../components/Layout.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { canAccessModule } from "../utils/moduleAccess.js";

export default function OverviewPage() {
  const { user } = useAuth();
  const accessibleModules = modules.filter(([slug]) => canAccessModule(user, slug));
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const saved = sessionStorage.getItem("overview_active_tab");
      if (saved && (saved === "all" || accessibleModules.some(([slug]) => slug === saved))) {
        return saved;
      }
    } catch {}
    return accessibleModules[0]?.[0] || "diesel";
  });
  const [openReport, setOpenReport] = useState(() => {
    try {
      const saved = sessionStorage.getItem("overview_active_tab");
      if (saved && accessibleModules.some(([slug]) => slug === saved)) {
        return saved;
      }
    } catch {}
    return accessibleModules[0]?.[0] || null;
  });
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 1024px)").matches,
  );
  const toggle = (slug) => {
    setOpenReport((current) => {
      const next = current === slug ? null : slug;
      if (next) {
        try { sessionStorage.setItem("overview_active_tab", next); } catch {}
      }
      return next;
    });
  };

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const update = (event) => setDesktop(event.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const hasDiesel = canAccessModule(user, "diesel");
  const hasTransport = canAccessModule(user, "transport");
  const hasAttendance = canAccessModule(user, "attendance");
  const hasMedicine = canAccessModule(user, "medicine");

  const isStaffOrAdmin =
    ["admin", "developer", "office", "supervisor", "security", "farm_incharge"].includes(user?.role) ||
    Boolean(user?.permissions?.worker_master || user?.permissions?.attendance_scan || user?.permissions?.attendance_report);

  if (desktop)
    return (
      <div className="space-y-6">
        {accessibleModules.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xs">
            {accessibleModules.map(([slug, label, icon]) => (
              <button
                key={slug}
                type="button"
                onClick={() => {
                  setActiveTab(slug);
                  try { sessionStorage.setItem("overview_active_tab", slug); } catch {}
                }}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                  activeTab === slug
                    ? "bg-emerald-700 text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                setActiveTab("all");
                try { sessionStorage.setItem("overview_active_tab", "all"); } catch {}
              }}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeTab === "all"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <span>📑</span>
              <span>All Modules</span>
            </button>
          </div>
        )}

        {(activeTab === "diesel" || activeTab === "all") && hasDiesel && <DieselReports compact />}
        {(activeTab === "transport" || activeTab === "all") && hasTransport && <TransportPage />}
        {(activeTab === "attendance" || activeTab === "all") && hasAttendance && (
          isStaffOrAdmin ? (
            <AttendanceReportPage />
          ) : (
            <WorkerAttendancePortal />
          )
        )}
        {(activeTab === "medicine" || activeTab === "all") && hasMedicine && <MedicineReportPage />}
        {!hasDiesel && !hasTransport && !hasAttendance && !hasMedicine && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
            No active report modules assigned to your account. Please contact your administrator.
          </div>
        )}
        {user.role === "developer" && (
          <section>
            <h2 className="mb-4 text-xl font-black text-slate-900">
              Next report modules
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {modules.filter(([slug]) => !["diesel", "transport", "attendance", "medicine"].includes(slug)).map(([slug, label, icon]) => (
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
        )}
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
      {accessibleModules.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 text-sm">
          No active report modules assigned to your account. Please contact your administrator.
        </div>
      ) : (
        accessibleModules.map(([slug, label, icon]) => {
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
                    className={`block text-[10px] font-bold uppercase tracking-wider ${["diesel", "transport", "attendance", "medicine"].includes(slug) ? "text-emerald-700" : "text-amber-600"}`}
                  >
                    {["diesel", "transport", "attendance", "medicine"].includes(slug) ? "Available" : "Ready for next phase"}
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
                  ) : slug === "attendance" ? (
                    isStaffOrAdmin ? (
                      <AttendanceReportPage />
                    ) : (
                      <WorkerAttendancePortal />
                    )
                  ) : slug === "medicine" ? (
                    <MedicineReportPage />
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
        })
      )}
    </div>
  );
}
