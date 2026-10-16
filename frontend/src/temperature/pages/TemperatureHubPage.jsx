import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { canAccessTemperatureEntry, canAccessTemperatureReport } from '../../utils/moduleAccess.js';
import TemperatureEntryPage from './TemperatureEntryPage.jsx';
import TemperatureReportPage from './TemperatureReportPage.jsx';

/**
 * Unified Temperature Management Hub.
 *
 * Permission and Role Behavior:
 * - Admin / Developer: Lands on [ 📊 Report ] first by default, with access to [ 📝 Enter Reading ].
 * - Rest of accounts (Workers / Supervisors / Staff): Lands on [ 📝 Enter Reading ] first by default,
 *   with access to [ 📊 Report ] only if permitted via 'temperature_report'.
 * - Granular user permissions:
 *   - 'temperature_entry': Can access entry & thermometer scan form.
 *   - 'temperature_report': Can access temperature report & KPIs.
 */
export default function TemperatureHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);
  const hasEntryAccess = canAccessTemperatureEntry(user);
  const hasReportAccess = canAccessTemperatureReport(user);

  // Determine default tab landing:
  // Admin/Dev -> 'report' first
  // All other accounts -> 'entry' first
  const defaultTab = useMemo(() => {
    if (isAdminOrDev) {
      if (hasReportAccess) return 'report';
      if (hasEntryAccess) return 'entry';
      return null;
    }
    // Non-admin accounts
    if (hasEntryAccess) return 'entry';
    if (hasReportAccess) return 'report';
    return null;
  }, [isAdminOrDev, hasEntryAccess, hasReportAccess]);

  const rawTab = searchParams.get('tab');
  let currentTab = rawTab;

  // Validate current tab against user permissions
  if (currentTab === 'report' && !hasReportAccess) {
    currentTab = hasEntryAccess ? 'entry' : null;
  } else if (currentTab === 'entry' && !hasEntryAccess) {
    currentTab = hasReportAccess ? 'report' : null;
  } else if (!currentTab) {
    currentTab = defaultTab;
  }

  const handleTabChange = (tab) => {
    setSearchParams({ tab });
  };

  // If user has neither permission
  if (!hasEntryAccess && !hasReportAccess) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl mb-3">
          🔒
        </div>
        <h2 className="text-base font-bold text-slate-800 mb-1">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have permission to view Temperature Entry or Reports. Please contact your system administrator to grant access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-w-7xl mx-auto pb-12">
      {/* Top Tab Navigation Bar (Shown when user has access to both entry and report) */}
      {hasEntryAccess && hasReportAccess && (
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 px-1">
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full sm:w-auto">
            {isAdminOrDev ? (
              <>
                <button
                  type="button"
                  onClick={() => handleTabChange('report')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    currentTab === 'report'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="text-sm">📊</span>
                  <span className="truncate">Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('entry')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    currentTab === 'entry'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="text-sm">📝</span>
                  <span className="truncate">Enter Reading</span>
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleTabChange('entry')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    currentTab === 'entry'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="text-sm">📝</span>
                  <span className="truncate">Enter Reading</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTabChange('report')}
                  className={`flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                    currentTab === 'report'
                      ? 'bg-emerald-700 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  <span className="text-sm">📊</span>
                  <span className="truncate">Report</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab Content */}
      {currentTab === 'entry' && hasEntryAccess ? (
        <TemperatureEntryPage />
      ) : currentTab === 'report' && hasReportAccess ? (
        <TemperatureReportPage />
      ) : null}
    </div>
  );
}
