import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Target, CheckCircle2, XCircle, Clock, TrendingUp, Award,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STAT = [
  { key: "total", label: "Total Indikator", icon: Target, color: "text-slate-700", bg: "bg-slate-100 dark:bg-slate-800" },
  { key: "achieved", label: "Tercapai Target", icon: CheckCircle2, color: "text-emerald-700", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
  { key: "not_achieved", label: "Belum Tercapai", icon: XCircle, color: "text-rose-700", bg: "bg-rose-50 dark:bg-rose-950/50" },
  { key: "not_calculated", label: "Belum Dihitung", icon: Clock, color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-950/50" },
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [cats, setCats] = useState([]);
  const [officers, setOfficers] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [f, setF] = useState({ year: "all", period_id: "all", category: "all", officer_id: "all", status: "all" });
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/categories").then((r) => setCats(r.data));
    api.get("/officers").then((r) => setOfficers(r.data));
    api.get("/periods").then((r) => setPeriods(r.data));
  }, []);

  useEffect(() => {
    const params = {};
    Object.entries(f).forEach(([k, v]) => { if (v !== "all") params[k] = v; });
    api.get("/dashboard", { params }).then((r) => setData(r.data));
  }, [f]);

  if (!data) return <div className="text-slate-500">Memuat dashboard…</div>;

  const c = data.counts;
  const pie = [
    { name: "Tercapai", value: c.achieved, color: "#059669" },
    { name: "Belum Tercapai", value: c.not_achieved, color: "#e11d48" },
    { name: "N/A", value: c.na, color: "#94a3b8" },
    { name: "Belum Dihitung", value: c.not_calculated, color: "#64748b" },
  ].filter((x) => x.value > 0);

  const Filter = ({ label, val, k, options, testid }) => (
    <Select value={val} onValueChange={(v) => setF({ ...f, [k]: v })}>
      <SelectTrigger className="w-full sm:w-[170px]" data-testid={testid}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: Semua</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      <PageHeader
        title="Dashboard Kinerja"
        subtitle="Ringkasan capaian indikator kinerja utama PN Sukadana"
        testid="dashboard-header"
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-2">
        <Filter label="Tahun" val={f.year} k="year" testid="filter-year-select"
          options={[...new Set(periods.map((p) => p.year))].map((y) => ({ value: String(y), label: String(y) }))} />
        <Filter label="Periode" val={f.period_id} k="period_id" testid="filter-period-select"
          options={periods.filter((p) => f.year === "all" || String(p.year) === f.year).map((p) => ({ value: p.id, label: p.period_name }))} />
        <Filter label="Kategori" val={f.category} k="category" testid="filter-category-select"
          options={cats.map((x) => ({ value: x.code, label: x.name }))} />
        <Filter label="Penanggung Jawab" val={f.officer_id} k="officer_id" testid="filter-officer-select"
          options={officers.map((o) => ({ value: o.id, label: o.name }))} />
        <Filter label="Status" val={f.status} k="status" testid="filter-status-select"
          options={[{ value: "ACHIEVED", label: "Tercapai" }, { value: "NOT_ACHIEVED", label: "Belum Tercapai" },
                    { value: "NOT_CALCULATED", label: "Belum Dihitung" }, { value: "N/A", label: "N/A" }]} />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.key} data-testid={`stat-card-${s.key}`} className="border-slate-200 dark:border-slate-800">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
                  <div className={`font-mono text-3xl font-extrabold ${s.color} dark:text-slate-100`}>{c[s.key]}</div>
                </div>
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${s.bg}`}>
                  <Icon className={`h-6 w-6 ${s.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Overall + charts */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base"><Award className="mr-2 inline h-4 w-4 text-amber-600" />Rata-rata Capaian</CardTitle></CardHeader>
          <CardContent>
            <div className="font-mono text-4xl font-extrabold text-[#0F4C3A] dark:text-emerald-400">{data.overall_achievement}%</div>
            <Progress value={Math.min(data.overall_achievement, 100)} className="mt-3" />
            <p className="mt-2 text-xs text-slate-500">Rata-rata realisasi terhadap target seluruh indikator terfilter.</p>
          </CardContent>
        </Card>
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Distribusi Status</CardTitle></CardHeader>
          <CardContent>
            {pie.length ? (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                    {pie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="py-12 text-center text-sm text-slate-400">Belum ada data status.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base"><TrendingUp className="mr-2 inline h-4 w-4 text-emerald-600" />Tren Capaian Tahunan</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={data.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="achievement" stroke="#0F4C3A" strokeWidth={2.5} dot={{ r: 4 }} name="Capaian %" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Category performance bar */}
      <Card className="mt-6">
        <CardHeader className="pb-2"><CardTitle className="text-base">Capaian Kinerja per Kelompok Indikator</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.category_performance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="achievement_pct" fill="#D97706" radius={[6, 6, 0, 0]} name="Capaian %" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Indicator table */}
      <Card className="mt-6">
        <CardHeader className="pb-2"><CardTitle className="text-base">Ringkasan Indikator Kinerja Utama (IKU)</CardTitle></CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Kode</TableHead>
                  <TableHead>Indikator</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Realisasi</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((r, i) => (
                  <TableRow key={r.indicator_id} data-testid={`indicator-table-row-${i}`}
                    className="cursor-pointer" onClick={() => navigate(`/indikator/${r.indicator_id}`)}>
                    <TableCell className="font-mono font-semibold text-[#0F4C3A]">{r.code}</TableCell>
                    <TableCell className="max-w-[380px]">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{r.name}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{r.category}</TableCell>
                    <TableCell className="text-right font-mono">{r.target ?? "-"}{r.unit === "%" ? "%" : ""}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{r.result != null ? `${r.result}${r.unit === "%" ? "%" : ""}` : "-"}</TableCell>
                    <TableCell className="text-center"><StatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Officer performance */}
      {data.officer_performance.length > 0 && (
        <Card className="mt-6">
          <CardHeader className="pb-2"><CardTitle className="text-base">Kinerja per Penanggung Jawab</CardTitle></CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Penanggung Jawab</TableHead><TableHead>Jabatan</TableHead>
                <TableHead className="text-center">Indikator</TableHead><TableHead className="text-center">Tercapai</TableHead>
                <TableHead className="text-center">Belum Dihitung</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.officer_performance.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{o.officer}</TableCell>
                    <TableCell className="text-sm text-slate-500">{o.position}</TableCell>
                    <TableCell className="text-center font-mono">{o.total}</TableCell>
                    <TableCell className="text-center font-mono text-emerald-600">{o.achieved}</TableCell>
                    <TableCell className="text-center font-mono text-amber-600">{o.not_calculated}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
