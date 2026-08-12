import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Indikator from "@/pages/Indikator";
import IndikatorDetail from "@/pages/IndikatorDetail";
import InputData from "@/pages/InputData";
import Perhitungan from "@/pages/Perhitungan";
import PenanggungJawab from "@/pages/PenanggungJawab";
import Periode from "@/pages/Periode";
import SumberData from "@/pages/SumberData";
import Laporan from "@/pages/Laporan";
import AuditLog from "@/pages/AuditLog";
import Pengguna from "@/pages/Pengguna";
import Pengaturan from "@/pages/Pengaturan";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Memuat…
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/indikator" element={<Protected><Indikator /></Protected>} />
      <Route path="/indikator/:id" element={<Protected><IndikatorDetail /></Protected>} />
      <Route path="/input-data" element={<Protected><InputData /></Protected>} />
      <Route path="/perhitungan" element={<Protected><Perhitungan /></Protected>} />
      <Route path="/penanggung-jawab" element={<Protected><PenanggungJawab /></Protected>} />
      <Route path="/periode" element={<Protected><Periode /></Protected>} />
      <Route path="/sumber-data" element={<Protected><SumberData /></Protected>} />
      <Route path="/laporan" element={<Protected><Laporan /></Protected>} />
      <Route path="/audit-log" element={<Protected><AuditLog /></Protected>} />
      <Route path="/pengguna" element={<Protected><Pengguna /></Protected>} />
      <Route path="/pengaturan" element={<Protected><Pengaturan /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}
