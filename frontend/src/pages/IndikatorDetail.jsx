import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, FileText, Calculator, History as HistoryIcon, Users, Database } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function IndikatorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ind, setInd] = useState(null);
  const [history, setHistory] = useState([]);
  const [latest, setLatest] = useState(null);

  useEffect(() => {
    api.get(`/indicators/${id}`).then((r) => setInd(r.data));
    api.get(`/history/${id}`).then((r) => {
      setHistory(r.data);
      if (r.data.length) setLatest(r.data[r.data.length - 1]);
    });
  }, [id]);

  if (!ind) return <div className="text-slate-500">Memuat…</div>;

  const Section = ({ icon: Icon, title, children }) => (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Icon className="h-4 w-4 text-emerald-600" />{title}</CardTitle></CardHeader>
      <CardContent className="text-sm">{children}</CardContent>
    </Card>
  );

  const trend = history.filter((h) => h.result != null).map((h) => ({ label: h.period_name, value: h.result }));

  return (
    <div>
      <Button variant="ghost" onClick={() => navigate("/indikator")} className="mb-3" data-testid="back-button"><ArrowLeft className="mr-1 h-4 w-4" /> Kembali</Button>

      {/* Header */}
      <Card className="mb-6 border-l-4 border-l-[#0F4C3A]">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-bold text-[#0F4C3A]">{ind.indicator_code}</span>
              <Badge variant="outline">{ind.indicator_type}</Badge>
              <Badge className={ind.active_status ? "bg-emerald-600 text-white" : "bg-slate-400 text-white"}>{ind.active_status ? "Aktif" : "Nonaktif"}</Badge>
            </div>
            <h1 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-100">{ind.indicator_name}</h1>
            <p className="mt-1 text-sm text-slate-500">PJ: {ind.officers?.map((o) => o.name).join(", ") || "-"}</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center"><div className="text-xs uppercase text-slate-400">Target</div><div className="font-mono text-2xl font-bold">{ind.target_value ?? "-"}{ind.unit === "%" ? "%" : ""}</div></div>
            <div className="text-center"><div className="text-xs uppercase text-slate-400">Realisasi</div><div className="font-mono text-2xl font-bold text-[#0F4C3A]">{latest?.result != null ? `${latest.result}${ind.unit === "%" ? "%" : ""}` : "-"}</div></div>
            <div className="flex flex-col items-center justify-center"><div className="mb-1 text-xs uppercase text-slate-400">Status</div><StatusBadge status={latest?.status || "NOT_CALCULATED"} /></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section icon={FileText} title="Definisi & Metode">
          <dl className="space-y-2">
            <div><dt className="text-xs uppercase text-slate-400">Tujuan</dt><dd>{ind.objective || "-"}</dd></div>
            <div><dt className="text-xs uppercase text-slate-400">Kategori</dt><dd>{ind.category_name}</dd></div>
            <div><dt className="text-xs uppercase text-slate-400">Frekuensi</dt><dd>{ind.reporting_frequency}</dd></div>
            <div><dt className="text-xs uppercase text-slate-400">Sumber Data</dt><dd>{ind.data_source}</dd></div>
          </dl>
        </Section>

        <Section icon={Calculator} title="Formula Perhitungan">
          <div className="rounded-md bg-slate-50 p-3 font-mono text-sm dark:bg-slate-800">{ind.formula_description || "-"}</div>
          {ind.numerator_definition && <div className="mt-3"><span className="text-xs uppercase text-slate-400">Pembilang:</span> {ind.numerator_definition}</div>}
          {ind.denominator_definition && <div className="mt-1"><span className="text-xs uppercase text-slate-400">Penyebut:</span> {ind.denominator_definition}</div>}
          {ind.components?.length > 0 && (
            <Table className="mt-3">
              <TableHeader><TableRow><TableHead>Komponen</TableHead><TableHead>Grup</TableHead><TableHead className="text-right">Bobot</TableHead></TableRow></TableHeader>
              <TableBody>{ind.components.map((c, i) => (
                <TableRow key={i}><TableCell>{c.name}</TableCell><TableCell className="text-slate-500">{c.group || "-"}</TableCell><TableCell className="text-right font-mono">{c.weight}%</TableCell></TableRow>
              ))}</TableBody>
            </Table>
          )}
        </Section>

        <Section icon={Users} title="Penanggung Jawab">
          {ind.officers?.length ? ind.officers.map((o, i) => (
            <div key={i} className="mb-2 flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 dark:border-slate-800">
              <div><div className="font-medium">{o.name}</div><div className="text-xs text-slate-400">{o.position}</div></div>
              <Badge variant="outline">{o.responsibility_type}</Badge>
            </div>
          )) : <p className="text-slate-400">Belum ada penanggung jawab.</p>}
        </Section>

        <Section icon={Database} title="Versi Formula">
          <Table>
            <TableHeader><TableRow><TableHead>Versi</TableHead><TableHead>Berlaku</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{ind.formula_versions?.map((v) => (
              <TableRow key={v.id}><TableCell className="font-mono">v{v.version_number}</TableCell><TableCell className="text-xs">{v.effective_start_date} → {v.effective_end_date || "sekarang"}</TableCell>
                <TableCell>{v.active_status ? <Badge className="bg-emerald-600 text-white">Aktif</Badge> : <Badge variant="outline">Arsip</Badge>}</TableCell></TableRow>
            ))}</TableBody>
          </Table>
        </Section>
      </div>

      {/* History */}
      <Card className="mt-6">
        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><HistoryIcon className="h-4 w-4 text-emerald-600" />Riwayat Kinerja</CardTitle></CardHeader>
        <CardContent>
          {trend.length > 0 && (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip />
                <Line type="monotone" dataKey="value" stroke="#0F4C3A" strokeWidth={2.5} dot={{ r: 4 }} name="Realisasi" />
              </LineChart>
            </ResponsiveContainer>
          )}
          <Table className="mt-4">
            <TableHeader><TableRow><TableHead>Periode</TableHead><TableHead className="text-right">Realisasi</TableHead><TableHead className="text-right">Target</TableHead><TableHead className="text-right">Gap</TableHead><TableHead>Status</TableHead><TableHead>Formula</TableHead><TableHead>Dihitung Oleh</TableHead></TableRow></TableHeader>
            <TableBody>
              {history.length ? [...history].reverse().map((h) => (
                <TableRow key={h.id}>
                  <TableCell>{h.period_name}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{h.result != null ? h.result : "-"}</TableCell>
                  <TableCell className="text-right font-mono">{h.target ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono">{h.gap != null ? h.gap : "-"}</TableCell>
                  <TableCell><StatusBadge status={h.status} /></TableCell>
                  <TableCell className="font-mono text-xs">v{h.formula_version_number}</TableCell>
                  <TableCell className="text-xs text-slate-500">{h.calculated_by}</TableCell>
                </TableRow>
              )) : <TableRow><TableCell colSpan={7} className="py-8 text-center text-slate-400">Belum ada perhitungan.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
