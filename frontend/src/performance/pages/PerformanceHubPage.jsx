import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { api } from '../../api/client.js';
import DailyEvaluationTab from '../components/DailyEvaluationTab.jsx';
import RatingComparisonTab from '../components/RatingComparisonTab.jsx';
import WorkersSalaryTab from '../components/WorkersSalaryTab.jsx';
import QuestionsMasterModal from '../components/QuestionsMasterModal.jsx';
import GradeSalaryMasterModal from '../components/GradeSalaryMasterModal.jsx';
import PerformanceIcon from '../../components/PerformanceIcon.jsx';
import { Spinner } from '../../components/Ui.jsx';

export default function PerformanceHubPage() {
  const { user } = useAuth();
  const isAdminOrDev = ['admin', 'developer'].includes(user?.role);
  const canManageSalary = isAdminOrDev || user?.permissions?.performance_salary === true;
  const canManageMasters = isAdminOrDev || user?.permissions?.performance_master === true;

  // Tabs: 'daily' | 'comparison' | 'salary' (Non-admin accounts without special permission only see 'daily')
  const [activeTab, setActiveTab] = useState('daily');

  useEffect(() => {
    if (!isAdminOrDev && activeTab === 'comparison') {
      setActiveTab('daily');
    } else if (!canManageSalary && activeTab === 'salary') {
      setActiveTab('daily');
    }
  }, [isAdminOrDev, canManageSalary, activeTab]);

  // Master Modals for Admin
  const [showQuestionsMaster, setShowQuestionsMaster] = useState(false);
  const [showGradeSalaryMaster, setShowGradeSalaryMaster] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Shared Firms State
  const [firms, setFirms] = useState([]);
  const [selectedFirmId, setSelectedFirmId] = useState('');
  const [loadingFirms, setLoadingFirms] = useState(true);

  useEffect(() => {
    async function loadFirms() {
      setLoadingFirms(true);
      try {
        const res = await api('/firms');
        const list = res.firms || [];
        setFirms(list);
        if (list.length > 0) {
          // Default to first active firm or user's assigned firm
          const preferred = list.find((f) => f.code === 'RAGHAV') || list[0];
          setSelectedFirmId(preferred._id);
        }
      } catch (err) {
        console.error('Failed to load firms:', err);
      } finally {
        setLoadingFirms(false);
      }
    }
    loadFirms();
  }, []);

  return (
    <div className="space-y-2 sm:space-y-4 pb-6">
      {/* Top Header - Ultra-compact on mobile to maximize table space */}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 border-b border-slate-200 pb-2 sm:pb-3">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-indigo-50 border border-indigo-200/70 text-indigo-700 font-bold shadow-xs">
              <PerformanceIcon className="h-4.5 w-4.5 sm:h-5 sm:w-5 drop-shadow-xs" />
            </span>
            <div>
              <h1 className="text-sm sm:text-base md:text-lg font-black text-slate-900 tracking-tight">
                Workers' Performance & Salary
              </h1>
              <p className="hidden md:block text-xs text-slate-500">
                Daily matrix evaluation, monthly scoring & salary revision workflow.
              </p>
            </div>
          </div>
        </div>

        {/* Master Management Buttons - Admin / Performance Master Only */}
        {canManageMasters && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="hidden sm:inline text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-0.5">
              Masters:
            </span>
            <button
              onClick={() => setShowQuestionsMaster(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <span>📝</span>
              Questions
            </button>
            <button
              onClick={() => setShowGradeSalaryMaster(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] sm:px-3 sm:py-1.5 sm:text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <span>⚖️</span>
              Grade & Salary
            </button>
          </div>
        )}
      </div>

      {/* Main Tab Switcher - Only shown if Admin or Salary tabs authorized */}
      {(isAdminOrDev || canManageSalary) && (
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('daily')}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
              activeTab === 'daily'
                ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>📋</span>
            1. Daily Evaluation
          </button>

          {/* Rating Comparison: Strictly ADMIN / DEVELOPER Only */}
          {isAdminOrDev && (
            <button
              onClick={() => setActiveTab('comparison')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeTab === 'comparison'
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>🔍</span>
              2. Rating Comparison
            </button>
          )}

          {canManageSalary && (
            <button
              onClick={() => setActiveTab('salary')}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 sm:px-5 sm:py-2 text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeTab === 'salary'
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>💰</span>
              3. Workers & Salary
            </button>
          )}
        </div>
      )}

      {/* Tab Contents */}
      {loadingFirms ? (
        <Spinner label="Loading firms…" />
      ) : (
        <div>
          {activeTab === 'daily' && (
            <DailyEvaluationTab
              firms={firms}
              selectedFirmId={selectedFirmId}
              onFirmChange={setSelectedFirmId}
              refreshKey={refreshKey}
            />
          )}

          {activeTab === 'comparison' && isAdminOrDev && (
            <RatingComparisonTab
              firms={firms}
              selectedFirmId={selectedFirmId}
              onFirmChange={setSelectedFirmId}
              refreshKey={refreshKey}
            />
          )}

          {activeTab === 'salary' && canManageSalary && (
            <WorkersSalaryTab
              firms={firms}
              selectedFirmId={selectedFirmId}
              onFirmChange={setSelectedFirmId}
              refreshKey={refreshKey}
            />
          )}
        </div>
      )}

      {/* Admin Master Modals */}
      {isAdminOrDev && (
        <>
          <QuestionsMasterModal
            isOpen={showQuestionsMaster}
            onClose={() => {
              setShowQuestionsMaster(false);
              setRefreshKey((k) => k + 1);
            }}
          />
          <GradeSalaryMasterModal
            isOpen={showGradeSalaryMaster}
            onClose={() => {
              setShowGradeSalaryMaster(false);
              setRefreshKey((k) => k + 1);
            }}
          />
        </>
      )}
    </div>
  );
}
