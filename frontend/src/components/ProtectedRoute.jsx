import { canAccessModule } from "../utils/moduleAccess.js";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner } from "./Ui.jsx";

export default function ProtectedRoute({
  admin = false,
  developer = false,
  attendanceStaff = false,
  attendanceAdmin = false,
  medicineAdmin = false,
  module = null,
  permission = null,
  children,
}) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;

  const isAdminOrDev = ["admin", "developer"].includes(user.role);

  if (admin && !isAdminOrDev) return <Navigate to="/" replace />;
  if (developer && user.role !== "developer") return <Navigate to="/" replace />;

  if (module && !canAccessModule(user, module)) {
    return <Navigate to="/" replace />;
  }

  if (permission) {
    const hasPerm = user.permissions?.[permission] === true || (isAdminOrDev && user.permissions?.[permission] !== false);
    if (!hasPerm) return <Navigate to="/" replace />;
  }

  if (medicineAdmin) {
    const hasMedicineAccess = canAccessModule(user, "medicine");
    const hasMasterPerm = user.permissions?.medicine_master === true || (isAdminOrDev && user.permissions?.medicine_master !== false);
    if (!hasMedicineAccess || !hasMasterPerm) {
      return <Navigate to="/" replace />;
    }
  }

  if (isAdminOrDev) return children;

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
