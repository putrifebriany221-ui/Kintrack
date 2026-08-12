import { Badge } from "@/components/ui/badge";

const MAP = {
  ACHIEVED: { label: "TERCAPAI", cls: "bg-emerald-600 text-white hover:bg-emerald-600" },
  NOT_ACHIEVED: { label: "BELUM TERCAPAI", cls: "bg-rose-600 text-white hover:bg-rose-600" },
  NA: { label: "N/A", cls: "bg-slate-400 text-white hover:bg-slate-400" },
  "N/A": { label: "N/A", cls: "bg-slate-400 text-white hover:bg-slate-400" },
  NOT_CALCULATED: { label: "BELUM DIHITUNG", cls: "bg-slate-500 text-white hover:bg-slate-500" },
  draft: { label: "DRAFT", cls: "bg-slate-500 text-white hover:bg-slate-500" },
  submitted: { label: "DIAJUKAN", cls: "bg-blue-600 text-white hover:bg-blue-600" },
  verified: { label: "DIVERIFIKASI", cls: "bg-indigo-600 text-white hover:bg-indigo-600" },
  approved: { label: "DISETUJUI", cls: "bg-emerald-600 text-white hover:bg-emerald-600" },
  locked: { label: "DIKUNCI", cls: "bg-amber-600 text-white hover:bg-amber-600" },
  Open: { label: "TERBUKA", cls: "bg-emerald-600 text-white hover:bg-emerald-600" },
  Locked: { label: "TERKUNCI", cls: "bg-amber-600 text-white hover:bg-amber-600" },
};

export default function StatusBadge({ status, testid }) {
  const m = MAP[status] || { label: status || "-", cls: "bg-slate-400 text-white" };
  return (
    <Badge data-testid={testid} className={`${m.cls} font-semibold text-[11px] tracking-wide`}>
      {m.label}
    </Badge>
  );
}
