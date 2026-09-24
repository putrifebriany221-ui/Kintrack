import { useEffect, useState } from "react";
import { RefreshCw, Calculator } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, isAdmin } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Perhitungan() {
  const { user } = useAuth();
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [calcs, setCalcs] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/periods").then((r) => { setPeriods(r.data); const open = r.data.find((p) => p.status === "Open"); if (open) setPeriodId(open.id); }); }, []);

  const load = () => { if (periodId) api.get("/calculations", { params: { period_id: periodId, latest_only: true } }).then((r) => setCalcs(r.data)); };
  useEffect(() => { load(); }, [periodId]);

  const recalc = async () => {
    if (!periodId) return toast.error("Pilih periode dahulu");
    setBusy(true);
    try { const { data } = await api.post("/recalculate-all", null, { params: { period_id: periodId } }); toast.success(`${data.count} indikator dihitung ulang`); load(); }
    catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader title="Perhitungan Indikator" subtitle="Hasil perhitungan otomatis mesin kalkulasi konfiguratif"
        actions={isAdmin(user) && <Button data-testid="recalculate-all-button" onClick={recalc} disabled={busy} className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Hitung Ulang Semua</Button>}
      />
      <div className="mb-4 max-w-xs">
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger data-testid="perhitungan-period-select"><SelectValue placeholder="Pilih periode" /></SelectTrigger>
          <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.period_name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Card><CardContent className="px-0 py-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Kode</TableHead><TableHead>Indikator</TableHead><TableHead className="text-right">Pembilang</TableHead>
            <TableHead className="text-right">Penyebut</TableHead><TableHead className="text-right">Hasil</TableHead>
            <TableHead className="text-right">Target</TableHead><TableHead className="text-right">Capaian</TableHead><TableHead className="text-right">Gap</TableHead>
            <TableHead className="text-center">Status</TableHead><TableHead>Dihitung</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {calcs.length ? calcs.map((c, i) => (
              <TableRow key={c.id} data-testid={`calc-row-${i}`}>
                <TableCell className="font-mono font-semibold text-[#0F4C3A]">{c.indicator_code}</TableCell>
                <TableCell className="max-w-[300px]">{c.indicator_name}{c.is_override && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-bold text-amber-700">OVERRIDE</span>}</TableCell>
                <TableCell className="text-right font-mono">{c.inputs?.numerator ?? "-"}</TableCell>
                <TableCell className="text-right font-mono">{c.inputs?.denominator ?? "-"}</TableCell>
                <TableCell className="text-right font-mono font-bold">{c.result != null ? c.result : "N/A"}</TableCell>
                <TableCell className="text-right font-mono">{c.target ?? "-"}</TableCell>
                <TableCell className="text-right font-mono text-amber-600">{c.achievement != null ? `${c.achievement}%` : "-"}</TableCell>
                <TableCell className="text-right font-mono">{c.gap != null ? c.gap : "-"}</TableCell>
                <TableCell className="text-center"><StatusBadge status={c.achievement_status || c.status} /></TableCell>
                <TableCell className="text-xs text-slate-500">{c.calculated_by}</TableCell>
              </TableRow>
            )) : <TableRow><TableCell colSpan={10} className="py-10 text-center text-slate-400">Belum ada perhitungan untuk periode ini. Input data lalu hitung.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div></CardContent></Card>
    </div>
  );
}
