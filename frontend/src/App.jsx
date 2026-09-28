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
import UserAdminPage from "./pages/UserAdminPage.jsx";
import AttendanceReportPage from "./attendance/pages/AttendanceReportPage.jsx";
import FaceAttendancePage from "./attendance/pages/FaceAttendancePage.jsx";
import WorkerAttendancePortal from "./attendance/pages/WorkerAttendancePortal.jsx";
import { useAuth } from "./context/AuthContext.jsx";

function AttendancePageRoute() {
  const { user } = useAuth();
  if (
    ["admin", "developer"].includes(user?.role) ||
    user?.permissions?.attendance_report ||
    user?.allowedModules?.includes("attendance")
  ) {
    return <AttendanceReportPage />;
  }
  return <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route
          path="reports/diesel"
          element={
            <ProtectedRoute module="diesel">
              <DieselPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/transport"
          element={
            <ProtectedRoute module="transport">
              <TransportPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/attendance"
          element={
            <ProtectedRoute module="attendance">
              <AttendancePageRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports/:slug"
          element={<ProtectedRoute developer><ComingSoonPage /></ProtectedRoute>}
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute admin>
              <UserAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/assets"
          element={
            <ProtectedRoute permission="asset_master">
              <AssetAdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/transport"
          element={
            <ProtectedRoute permission="transport_master">
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
          <ProtectedRoute permission="attendance_scan">
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
