import { useEffect, useState } from "react";
import { Printer, FileDown, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const REPORTS = [
  { v: "iku", label: "Laporan Capaian IKU" },
  { v: "officer", label: "Matriks Penanggung Jawab" },
  { v: "achievement", label: "Capaian vs Target" },
  { v: "history", label: "Riwayat Perhitungan" },
];

function toCSV(rows, headers) {
  const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(",")];
  rows.forEach((r) => lines.push(r.map(esc).join(",")));
  return lines.join("\n");
}

export default function Laporan() {
  const [type, setType] = useState("iku");
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("all");
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    api.get("/periods").then((r) => setPeriods(r.data));
    api.get("/settings").then((r) => setSettings(r.data));
  }, []);

  useEffect(() => {
    const params = { latest_only: true };
    if (periodId !== "all") params.period_id = periodId;
    api.get("/calculations", { params }).then((r) => setRows(r.data));
  }, [periodId]);

  const exportCSV = () => {
    const headers = ["Kode", "Indikator", "Periode", "Hasil", "Target", "Gap", "Status", "Formula", "Dihitung Oleh"];
    const data = rows.map((c) => [c.indicator_code, c.indicator_name, c.period_name, c.result, c.target, c.gap, c.status, `v${c.formula_version_number}`, c.calculated_by]);
    const blob = new Blob([toCSV(data, headers)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `laporan-${type}-${Date.now()}.csv`;
    link.click();
    toast.success("Export Excel/CSV berhasil");
  };

  return (
    <div>
      <PageHeader title="Laporan Kinerja" subtitle="Laporan capaian indikator, cetak & ekspor"
        actions={<div className="flex gap-2 no-print">
          <Button variant="outline" onClick={() => window.print()} data-testid="print-button"><Printer className="mr-1 h-4 w-4" /> Cetak</Button>
          <Button variant="outline" onClick={exportCSV} data-testid="export-excel-button"><FileSpreadsheet className="mr-1 h-4 w-4" /> Export Excel</Button>
          <Button variant="outline" onClick={() => { window.print(); }} data-testid="export-pdf-button"><FileDown className="mr-1 h-4 w-4" /> Export PDF</Button>
        </div>} />

      <div className="mb-4 flex flex-wrap gap-2 no-print">
        <Select value={type} onValueChange={setType}><SelectTrigger className="w-[240px]" data-testid="report-type-select"><SelectValue /></SelectTrigger>
          <SelectContent>{REPORTS.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}</SelectContent></Select>
        <Select value={periodId} onValueChange={setPeriodId}><SelectTrigger className="w-[200px]" data-testid="report-period-select"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">Semua Periode</SelectItem>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.period_name}</SelectItem>)}</SelectContent></Select>
      </div>

      <Card>
        <CardHeader className="border-b text-center">
          <div className="text-xs uppercase tracking-widest text-slate-400">{settings.institution || "Pengadilan Negeri Sukadana"}</div>
          <CardTitle className="font-display text-xl">{REPORTS.find((r) => r.v === type)?.label}</CardTitle>
          <div className="text-sm text-slate-500">{periodId === "all" ? "Seluruh Periode" : periods.find((p) => p.id === periodId)?.period_name}</div>
        </CardHeader>
        <CardContent className="px-0 py-0"><div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Kode</TableHead><TableHead>Indikator</TableHead><TableHead>Periode</TableHead>
              <TableHead className="text-right">Realisasi</TableHead><TableHead className="text-right">Target</TableHead>
              <TableHead className="text-right">Gap</TableHead><TableHead className="text-center">Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.length ? rows.map((c, i) => (
                <TableRow key={c.id} data-testid={`report-row-${i}`}>
                  <TableCell className="font-mono font-semibold text-[#0F4C3A]">{c.indicator_code}</TableCell>
                  <TableCell className="max-w-[340px]">{c.indicator_name}</TableCell>
                  <TableCell className="text-sm">{c.period_name}</TableCell>
                  <TableCell className="text-right font-mono font-bold">{c.result != null ? c.result : "N/A"}</TableCell>
                  <TableCell className="text-right font-mono">{c.target ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono">{c.gap != null ? c.gap : "-"}</TableCell>
                  <TableCell className="text-center"><StatusBadge status={c.status} /></TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-slate-400">Belum ada data perhitungan untuk ditampilkan.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div></CardContent>
      </Card>
    </div>
  );
}
