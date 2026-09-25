import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { LoginPage, RegisterPage, SetupPage } from "./pages/AuthPages.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import DieselPage from "./pages/DieselPage.jsx";
import ComingSoonPage from "./pages/ComingSoonPage.jsx";
import AssetAdminPage from "./pages/AssetAdminPage.jsx";
import TransportPage from "./pages/TransportPage.jsx";
import TransportAdminPage from "./pages/TransportAdminPage.jsx";
import AttendanceAdminPage from "./pages/AttendanceAdminPage.jsx";
import AttendanceReportPage from "./attendance/pages/AttendanceReportPage.jsx";
import FaceAttendancePage from "./attendance/pages/FaceAttendancePage.jsx";
import WorkerAttendancePortal from "./attendance/pages/WorkerAttendancePortal.jsx";
import MedicineMasterPage from "./medicine/pages/MedicineMasterPage.jsx";
import MedicineReportPage from "./medicine/pages/MedicineReportPage.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function AttendancePageRoute() {
  const { user } = useAuth();
  if (["admin", "developer", "office", "supervisor", "security", "farm_incharge"].includes(user?.role)) {
    return <AttendanceReportPage />;
  }
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="reports/diesel" element={<DieselPage />} />
        <Route path="reports/transport" element={<TransportPage />} />
        <Route
          path="reports/attendance"
          element={
            <ProtectedRoute attendanceStaff>
              <AttendancePageRoute />
            </ProtectedRoute>
          }
        />
        <Route path="reports/medicine" element={<MedicineReportPage />} />
        <Route
          path="reports/:slug"
          element={<ProtectedRoute developer><ComingSoonPage /></ProtectedRoute>}
        />

        {/* Administration: Master Data (Admin & Developer Only) */}
        <Route
          path="admin/medicine/master"
          element={
            <ProtectedRoute admin>
              <MedicineMasterPage />
            </ProtectedRoute>
          }
        />
        <Route path="admin/medicine" element={<Navigate to="/admin/medicine/master" replace />} />
        <Route path="medicine/master" element={<Navigate to="/admin/medicine/master" replace />} />
        <Route
          path="admin/assets"
          element={
            <ProtectedRoute admin>
              <AssetAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/transport"
          element={
            <ProtectedRoute admin>
              <TransportAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/attendance"
          element={
            <ProtectedRoute attendanceAdmin>
              <AttendanceAdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route
        path="attendance/scan"
        element={
          <ProtectedRoute attendanceStaff>
            <FaceAttendancePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="worker/attendance"
        element={
          <ProtectedRoute>
            <WorkerAttendancePortal />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
