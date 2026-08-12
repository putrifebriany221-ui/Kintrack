import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("kintrack_token");
    if (!token) { setUser(false); setReady(true); return; }
    api.get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => { localStorage.removeItem("kintrack_token"); setUser(false); })
      .finally(() => setReady(true));
  }, []);

  const login = (token, u) => {
    localStorage.setItem("kintrack_token", token);
    setUser(u);
  };
  const logout = () => {
    localStorage.removeItem("kintrack_token");
    setUser(false);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const ROLES = {
  super_admin: "Super Admin",
  admin_operator: "Admin / Operator",
  responsible_officer: "Penanggung Jawab",
  viewer: "Pimpinan / Viewer",
};

export const can = (user, ...roles) => user && roles.includes(user.role);
export const canEdit = (user) =>
  user && ["super_admin", "admin_operator", "responsible_officer"].includes(user.role);
export const isAdmin = (user) =>
  user && ["super_admin", "admin_operator"].includes(user.role);
