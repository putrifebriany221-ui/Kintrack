import { NavLink, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  LayoutDashboard, Target, FileSpreadsheet, Calculator, UserCheck, Calendar,
  Database, Printer, History, Users, Settings, LogOut, Menu, X, Scale,
} from "lucide-react";
import { useAuth, ROLES } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, id: "dashboard" },
  { to: "/indikator", label: "Indikator", icon: Target, id: "indikator" },
  { to: "/input-data", label: "Input Data", icon: FileSpreadsheet, id: "input-data" },
  { to: "/perhitungan", label: "Perhitungan", icon: Calculator, id: "perhitungan" },
  { to: "/penanggung-jawab", label: "Penanggung Jawab", icon: UserCheck, id: "penanggung-jawab" },
  { to: "/periode", label: "Periode", icon: Calendar, id: "periode" },
  { to: "/sumber-data", label: "Sumber Data", icon: Database, id: "sumber-data" },
  { to: "/laporan", label: "Laporan", icon: Printer, id: "laporan" },
  { to: "/audit-log", label: "Audit Log", icon: History, id: "audit-log", roles: ["super_admin", "admin_operator"] },
  { to: "/pengguna", label: "Pengguna", icon: Users, id: "pengguna", roles: ["super_admin"] },
  { to: "/pengaturan", label: "Pengaturan", icon: Settings, id: "pengaturan", roles: ["super_admin"] },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user?.role));

  return (
    <div className="min-h-screen bg-background">
      {/* Institutional top bar */}
      <div className="bg-[#0F4C3A] text-white">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/10">
              <Scale className="h-5 w-5 text-amber-400" />
            </div>
            <div className="leading-tight">
              <div className="font-display text-base font-extrabold tracking-tight">KINTRACK PN SUKADANA</div>
              <div className="text-[11px] text-emerald-100/80">Sistem Tracking Kinerja Pengadilan Negeri Sukadana</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-[11px] text-emerald-100/80">{ROLES[user?.role] || user?.role}</div>
            </div>
            <Button
              data-testid="logout-button"
              onClick={logout}
              variant="ghost"
              size="sm"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-1 h-4 w-4" /> Keluar
            </Button>
            <button className="md:hidden" onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle">
              {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Nav bar */}
      <nav className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95">
        <div className={`mx-auto max-w-[1600px] px-2 md:flex md:items-center ${open ? "block" : "hidden md:flex"}`}>
          <div className="flex flex-col gap-0.5 py-2 md:flex-row md:flex-wrap md:gap-1 md:py-0">
            {items.map((n) => {
              const Icon = n.icon;
              return (
                <NavLink
                  key={n.id}
                  to={n.to}
                  data-testid={`nav-${n.id}-link`}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" /> {n.label}
                </NavLink>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-[1600px] px-4 py-6 animate-fade-up">{children}</main>
    </div>
  );
}
