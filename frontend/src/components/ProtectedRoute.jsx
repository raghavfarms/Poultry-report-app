import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { Spinner } from "./Ui.jsx";

export default function ProtectedRoute({ admin = false, developer = false, attendanceStaff = false, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && !["admin", "developer"].includes(user.role)) return <Navigate to="/" replace />;
  if (developer && user.role !== "developer") return <Navigate to="/" replace />;
  if (attendanceStaff && !["admin", "developer", "office", "supervisor", "security", "farm_incharge"].includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
