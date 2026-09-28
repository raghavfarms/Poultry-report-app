import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner } from "./Ui.jsx";

export default function ProtectedRoute({
  admin = false,
  developer = false,
  attendanceStaff = false,
  attendanceAdmin = false,
  module = null,
  permission = null,
  children,
}) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;

  const isAdminOrDev = ["admin", "developer"].includes(user.role);
  if (isAdminOrDev) return children;

  if (admin && !isAdminOrDev) return <Navigate to="/" replace />;
  if (developer && user.role !== "developer") return <Navigate to="/" replace />;

  if (module && !user.allowedModules?.includes(module)) {
    return <Navigate to="/" replace />;
  }

  if (permission && !user.permissions?.[permission]) {
    return <Navigate to="/" replace />;
  }

  if (
    attendanceStaff &&
    !user.permissions?.attendance_scan &&
    !user.permissions?.attendance_report &&
    !["office", "supervisor", "security", "farm_incharge"].includes(user.role)
  ) {
    return <Navigate to="/" replace />;
  }

  if (
    attendanceAdmin &&
    !user.permissions?.worker_master &&
    !user.permissions?.attendance_admin_master &&
    !["office", "supervisor", "farm_incharge"].includes(user.role)
  ) {
    return <Navigate to="/" replace />;
  }

  return children;
}
