import React, { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  canAccessTemperatureEntry,
  canAccessTemperatureReport,
  canAccessTemperatureWeekly
} from '../../utils/moduleAccess.js';
import TemperatureEntryPage from './TemperatureEntryPage.jsx';
import TemperatureReportPage from './TemperatureReportPage.jsx';
import TemperatureWeeklyPage from './TemperatureWeeklyPage.jsx';

/**
 * Unified Temperature Management Hub with Dynamic Tab-Based Permissions.
 *
 * Tab Access:
 * - 'temperature_entry': Can access [ 📝 Enter Reading ]
 * - 'temperature_report': Can access [ 📊 Report ] (Daily Report)
 * - 'temperature_weekly': Can access [ 📅 Weekly ] (Weekly 7-Day Matrix)
 *
 * Behavior:
 * - Admin / Developer: Access to all 3 tabs, landing on [ 📊 Report ] first.
 * - Non-admin users: Only tabs explicitly permitted by Admin are shown.
 * - Single-tab users: Lands directly on their permitted tab with zero tab navigation clutter.
 */
export default function TemperatureHubPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();

  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);
  const hasEntryAccess = canAccessTemperatureEntry(user);
  const hasDailyAccess = canAccessTemperatureReport(user);
  const hasWeeklyAccess = canAccessTemperatureWeekly(user);

  // Dynamic accessible tabs list based on granular permissions
  const accessibleTabs = useMemo(() => {
    const list = [];
    if (isAdminOrDev) {
      if (hasDailyAccess) list.push({ id: 'report', label: 'Report', icon: '📊' });
      if (hasWeeklyAccess) list.push({ id: 'weekly', label: 'Weekly', icon: '📅' });
      if (hasEntryAccess) list.push({ id: 'entry', label: 'Enter Reading', icon: '📝' });
    } else {
      if (hasEntryAccess) list.push({ id: 'entry', label: 'Enter Reading', icon: '📝' });
      if (hasDailyAccess) list.push({ id: 'report', label: 'Report', icon: '📊' });
      if (hasWeeklyAccess) list.push({ id: 'weekly', label: 'Weekly', icon: '📅' });
    }
    return list;
  }, [isAdminOrDev, hasEntryAccess, hasDailyAccess, hasWeeklyAccess]);

  const rawTab = searchParams.get('tab');
  const accessibleTabIds = accessibleTabs.map((t) => t.id);

  let currentTab = rawTab;
  if (!currentTab || !accessibleTabIds.includes(currentTab)) {
    currentTab = accessibleTabs[0]?.id || null;
  }

  const handleTabChange = (tab) => {
    setSearchParams({ tab });
  };

  // If user has zero permitted tabs
  if (accessibleTabs.length === 0) {
    return (
      <div className="max-w-xl mx-auto my-12 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xl mb-3">
          🔒
        </div>
        <h2 className="text-base font-bold text-slate-800 mb-1">Access Restricted</h2>
        <p className="text-xs text-slate-500">
          You do not have permission to view Temperature tabs. Please contact your system administrator to grant tab access.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 max-w-7xl mx-auto pb-12">
      {/* Top Tab Navigation Bar (Shown only when user has 2 or more accessible tabs) */}
      {accessibleTabs.length > 1 && (
        <div className="flex items-center justify-between border-b border-slate-200/80 pb-2 px-1">
          <div
            className={`grid gap-1.5 bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full sm:w-auto ${
              accessibleTabs.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
            }`}
          >
            {accessibleTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                  currentTab === tab.id
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                }`}
              >
                <span className="text-sm">{tab.icon}</span>
                <span className="truncate">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab Content */}
      {currentTab === 'entry' && hasEntryAccess ? (
        <TemperatureEntryPage />
      ) : currentTab === 'report' && hasDailyAccess ? (
        <TemperatureReportPage />
      ) : currentTab === 'weekly' && hasWeeklyAccess ? (
        <TemperatureWeeklyPage />
      ) : null}
    </div>
  );
}
