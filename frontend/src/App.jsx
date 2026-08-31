import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { LoginPage, RegisterPage, SetupPage } from "./pages/AuthPages.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import DieselPage from "./pages/DieselPage.jsx";
import ComingSoonPage from "./pages/ComingSoonPage.jsx";
import AssetAdminPage from "./pages/AssetAdminPage.jsx";

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
        <Route path="reports/:slug" element={<ComingSoonPage />} />
        <Route
          path="admin/assets"
          element={
            <ProtectedRoute admin>
              <AssetAdminPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
