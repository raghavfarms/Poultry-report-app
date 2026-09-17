import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("poultry_user"));
    } catch {
      return null;
    }
  });
  // Only block the UI if a token exists but no user profile is cached in localStorage yet.
  // When user is already cached, render immediately (0s wait) and revalidate in background.
  const [loading, setLoading] = useState(() => {
    const hasToken = Boolean(localStorage.getItem("poultry_token"));
    const hasUser = Boolean(localStorage.getItem("poultry_user"));
    return hasToken && !hasUser;
  });

  const logout = () => {
    localStorage.removeItem("poultry_token");
    localStorage.removeItem("poultry_user");
    setUser(null);
  };

  const acceptSession = ({ token, user: nextUser }) => {
    localStorage.setItem("poultry_token", token);
    localStorage.setItem("poultry_user", JSON.stringify(nextUser));
    setUser(nextUser);
  };

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener("auth-expired", onExpired);
    if (localStorage.getItem("poultry_token")) {
      api("/auth/me")
        .then(({ user: current }) => {
          localStorage.setItem("poultry_user", JSON.stringify(current));
          setUser(current);
        })
        .catch((err) => {
          // If server returns 401, client.js dispatches "auth-expired" which handles logout.
          // For network timeouts or server waking up, do not kick the user out prematurely.
          console.warn("Session background sync:", err?.message || err);
        })
        .finally(() => setLoading(false));
    } else setLoading(false);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  const value = useMemo(
    () => ({ user, loading, acceptSession, logout }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
