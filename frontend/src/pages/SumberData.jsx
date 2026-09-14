import { useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Database, Server, PlugZap } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, isAdmin } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY = { indicator_id: "", source_code: "SIPP", source_table: "", source_field: "", filter_condition: "", proses_id: "", tahapan_id: "", date_field: "", case_type: "", mapping_note: "", numerator_query: "", denominator_query: "" };
const CONN_EMPTY = { host: "", port: 3306, database: "", username: "", password: "" };

export default function SumberData() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [connOpen, setConnOpen] = useState(false);
  const [conn, setConn] = useState(CONN_EMPTY);
  const [connInfo, setConnInfo] = useState(null);
  const [testing, setTesting] = useState(false);

  const load = () => api.get("/mappings").then((r) => setMappings(r.data));
  const loadConn = () => api.get("/sipp/connection").then((r) => setConnInfo(r.data)).catch(() => {});
  useEffect(() => {
    api.get("/data-sources").then((r) => setSources(r.data));
    api.get("/indicators").then((r) => setIndicators(r.data));
    api.get("/sipp-processes").then((r) => setProcesses(r.data));
    load();
    loadConn();
  }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setC = (k, v) => setConn((c) => ({ ...c, [k]: v }));

  const openConn = () => {
    setConn({ ...CONN_EMPTY, ...(connInfo?.configured ? { host: connInfo.host, port: connInfo.port, database: connInfo.database, username: connInfo.username, password: "" } : {}) });
    setConnOpen(true);
  };
  const saveConn = async () => {
    if (!conn.host || !conn.database || !conn.username) return toast.error("Host, database, dan username wajib diisi");
    try { await api.put("/sipp/connection", { ...conn, port: Number(conn.port) }); toast.success("Koneksi SIPP tersimpan"); loadConn(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const testConn = async () => {
    setTesting(true);
    try {
      if (window.kintrack?.sippTest) {
        // Desktop app: connect directly from this machine (works for LAN IPs like 10.x.x.x)
        const { data: cfg } = await api.get("/sipp/connection/full");
        const res = await window.kintrack.sippTest(cfg);
        toast.success(`Terhubung langsung (desktop) ke MariaDB ${res.server_version}`);
      } else {
        const { data } = await api.post("/sipp/test-connection");
        toast.success(`Terhubung! MariaDB ${data.server_version}, ${data.table_count} tabel`);
      }
      loadConn();
    } catch (e) {
      const msg = window.kintrack
        ? (e?.message || String(e)).replace(/^Error invoking remote method '.*?': Error: /, "")
        : apiError(e);
      toast.error(msg);
    }
    finally { setTesting(false); }
  };
  const resetConn = async () => {
    try { await api.delete("/sipp/connection"); toast.success("Koneksi SIPP direset"); setConnInfo({ configured: false }); }
    catch (e) { toast.error(apiError(e)); }
  };

  const save = async () => {
    if (!form.indicator_id) return toast.error("Pilih indikator");
    try { await api.post("/mappings", form); toast.success("Pemetaan tersimpan"); setOpen(false); setForm(EMPTY); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { try { await api.delete(`/mappings/${id}`); toast.success("Dihapus"); load(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Sumber Data & Integrasi SIPP" subtitle="Konfigurasi pemetaan indikator ke sumber data (SIPP baca-saja / manual)"
        actions={isAdmin(user) && <div className="flex gap-2">
          <Button variant="outline" onClick={openConn} data-testid="sipp-connection-button"><Server className="mr-1 h-4 w-4" /> Koneksi SIPP</Button>
          <Button onClick={() => { setForm(EMPTY); setOpen(true); }} data-testid="add-mapping-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><Plus className="mr-1 h-4 w-4" /> Tambah Pemetaan</Button>
        </div>} />

      <Tabs defaultValue="mapping">
        <TabsList><TabsTrigger value="mapping" data-testid="tab-mapping">Pemetaan Data</TabsTrigger><TabsTrigger value="sources" data-testid="tab-sources">Sumber Data</TabsTrigger><TabsTrigger value="sipp" data-testid="tab-sipp">Referensi Proses SIPP</TabsTrigger></TabsList>

        <TabsContent value="mapping" className="pt-4">
          {connInfo && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900" data-testid="sipp-connection-status">
              <Server className="h-4 w-4 text-emerald-600" />
              {connInfo.configured ? (
                <>
                  <span className="font-medium">Koneksi SIPP:</span>
                  <span className="font-mono text-slate-600 dark:text-slate-300">{connInfo.username}@{connInfo.host}:{connInfo.port}/{connInfo.database}</span>
                  <Badge className={connInfo.last_status === "OK" ? "bg-emerald-600 text-white" : connInfo.last_status === "FAILED" ? "bg-rose-600 text-white" : "bg-slate-400 text-white"}>
                    {connInfo.last_status || "Belum diuji"}
                  </Badge>
                  {isAdmin(user) && <Button size="sm" variant="outline" onClick={testConn} disabled={testing} data-testid="sipp-test-button"><PlugZap className={`mr-1 h-4 w-4 ${testing ? "animate-pulse" : ""}`} /> Uji Koneksi</Button>}
                  {user?.role === "super_admin" && <Button size="sm" variant="ghost" onClick={resetConn} data-testid="sipp-reset-button" className="text-rose-600 hover:text-rose-700">Reset</Button>}
                </>
              ) : <span className="text-slate-500">Koneksi SIPP belum dikonfigurasi. Klik "Koneksi SIPP" untuk mengatur (baca-saja).</span>}
            </div>
          )}
          <Card><CardContent className="px-0 py-0"><div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Indikator</TableHead><TableHead>Sumber</TableHead><TableHead>Tabel/View</TableHead><TableHead>Field</TableHead><TableHead>Proses ID</TableHead><TableHead>Filter</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
              <TableBody>
                {mappings.length ? mappings.map((m, i) => (
                  <TableRow key={m.id} data-testid={`mapping-row-${i}`}>
                    <TableCell><span className="font-mono text-[#0F4C3A]">{m.indicator_code}</span> {m.indicator_name}</TableCell>
                    <TableCell><Badge variant="outline">{m.source_code}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{m.source_table || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{m.source_field || "-"}</TableCell>
                    <TableCell className="font-mono text-xs">{m.proses_id || "-"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs text-slate-500">{m.filter_condition || "-"}</TableCell>
                    <TableCell className="text-right">{isAdmin(user) && <Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}</TableCell>
                  </TableRow>
                )) : <TableRow><TableCell colSpan={7} className="py-10 text-center text-slate-400">Belum ada pemetaan. Integrasi SIPP disiapkan untuk diaktifkan nanti.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div></CardContent></Card>
        </TabsContent>

        <TabsContent value="sources" className="grid gap-4 pt-4 sm:grid-cols-2">
          {sources.map((s) => (
            <Card key={s.id}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4 text-emerald-600" />{s.name}</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-500">
                <p>{s.description}</p>
                <div className="mt-2 flex gap-2"><Badge variant="outline">{s.type}</Badge>{s.read_only && <Badge className="bg-amber-500 text-white">Baca-saja</Badge>}<Badge className={s.active ? "bg-emerald-600 text-white" : "bg-slate-400 text-white"}>{s.active ? "Aktif" : "Nonaktif"}</Badge></div>
              </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="sipp" className="pt-4">
          <Card><CardContent className="px-0 py-0">
            <Table>
              <TableHeader><TableRow><TableHead className="w-24">Proses ID</TableHead><TableHead>Nama Proses (tabel perkara_proses)</TableHead></TableRow></TableHeader>
              <TableBody>{processes.map((p) => (<TableRow key={p.id}><TableCell className="font-mono font-semibold">{p.proses_id}</TableCell><TableCell>{p.proses_nama}</TableCell></TableRow>))}</TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Tambah Pemetaan Sumber Data</DialogTitle><DialogDescription>Konfigurasi mapping antara indikator dan sumber data SIPP/manual.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>Indikator</Label><Select value={form.indicator_id} onValueChange={(v) => set("indicator_id", v)}><SelectTrigger className="mt-1" data-testid="mapping-indicator"><SelectValue placeholder="Pilih" /></SelectTrigger><SelectContent>{indicators.map((i) => <SelectItem key={i.id} value={i.id}>{i.indicator_code} — {i.short_name}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Sumber</Label><Select value={form.source_code} onValueChange={(v) => set("source_code", v)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{sources.map((s) => <SelectItem key={s.code} value={s.code}>{s.code}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Tabel / View</Label><Input value={form.source_table} onChange={(e) => set("source_table", e.target.value)} placeholder="perkara_proses" className="mt-1 font-mono" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Field</Label><Input value={form.source_field} onChange={(e) => set("source_field", e.target.value)} className="mt-1 font-mono" /></div>
              <div><Label>Proses ID</Label><Input value={form.proses_id} onChange={(e) => set("proses_id", e.target.value)} className="mt-1 font-mono" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Field Tanggal</Label><Input value={form.date_field} onChange={(e) => set("date_field", e.target.value)} className="mt-1 font-mono" /></div>
              <div><Label>Jenis Perkara</Label><Input value={form.case_type} onChange={(e) => set("case_type", e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>Kondisi Filter</Label><Input value={form.filter_condition} onChange={(e) => set("filter_condition", e.target.value)} placeholder="cth: tanggal <= batas" className="mt-1 font-mono" /></div>
            {form.source_code === "SIPP" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <p className="mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">Query Auto-Pull SIPP (baca-saja, harus SELECT). Numerator & denominator diambil sebagai nilai skalar (baris & kolom pertama).</p>
                <Label className="text-xs">Query Pembilang (Numerator)</Label>
                <Textarea data-testid="mapping-numerator-query" value={form.numerator_query} onChange={(e) => set("numerator_query", e.target.value)} rows={2} className="mt-1 font-mono text-xs" placeholder="SELECT COUNT(*) FROM perkara_proses WHERE proses_id=210 AND ..." />
                <Label className="mt-2 text-xs">Query Penyebut (Denominator)</Label>
                <Textarea data-testid="mapping-denominator-query" value={form.denominator_query} onChange={(e) => set("denominator_query", e.target.value)} rows={2} className="mt-1 font-mono text-xs" placeholder="SELECT COUNT(*) FROM perkara WHERE ..." />
              </div>
            )}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button onClick={save} data-testid="save-mapping-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={connOpen} onOpenChange={setConnOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Koneksi SIPP (MariaDB — Baca-saja)</DialogTitle>
            <DialogDescription>Masukkan kredensial pengguna baca-saja SIPP. Kredensial disimpan di server, tidak pernah di-hardcode.</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>Host</Label><Input data-testid="sipp-host" value={conn.host} onChange={(e) => setC("host", e.target.value)} placeholder="10.0.0.5 / db.sipp.local" className="mt-1 font-mono" /></div>
              <div><Label>Port</Label><Input data-testid="sipp-port" type="number" value={conn.port} onChange={(e) => setC("port", e.target.value)} className="mt-1 font-mono" /></div>
            </div>
            <div><Label>Database</Label><Input data-testid="sipp-database" value={conn.database} onChange={(e) => setC("database", e.target.value)} placeholder="sipp_pn_sukadana" className="mt-1 font-mono" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Username</Label><Input data-testid="sipp-username" value={conn.username} onChange={(e) => setC("username", e.target.value)} className="mt-1 font-mono" /></div>
              <div><Label>Password</Label><Input data-testid="sipp-password" type="password" value={conn.password} onChange={(e) => setC("password", e.target.value)} placeholder={connInfo?.has_password ? "••• (tersimpan)" : ""} className="mt-1 font-mono" /></div>
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={testConn} disabled={testing} data-testid="sipp-test-in-dialog"><PlugZap className="mr-1 h-4 w-4" /> Uji Koneksi</Button>
            <Button onClick={saveConn} data-testid="save-sipp-connection" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
