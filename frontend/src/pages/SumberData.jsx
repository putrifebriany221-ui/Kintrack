import { useEffect, useState } from "react";
import { Plus, Trash2, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, isAdmin } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const EMPTY = { indicator_id: "", source_code: "SIPP", source_table: "", source_field: "", filter_condition: "", proses_id: "", tahapan_id: "", date_field: "", case_type: "", mapping_note: "" };

export default function SumberData() {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [indicators, setIndicators] = useState([]);
  const [processes, setProcesses] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/mappings").then((r) => setMappings(r.data));
  useEffect(() => {
    api.get("/data-sources").then((r) => setSources(r.data));
    api.get("/indicators").then((r) => setIndicators(r.data));
    api.get("/sipp-processes").then((r) => setProcesses(r.data));
    load();
  }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.indicator_id) return toast.error("Pilih indikator");
    try { await api.post("/mappings", form); toast.success("Pemetaan tersimpan"); setOpen(false); setForm(EMPTY); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { try { await api.delete(`/mappings/${id}`); toast.success("Dihapus"); load(); } catch (e) { toast.error(apiError(e)); } };
  const sync = async () => { try { await api.post("/sipp/sync"); toast.success("Sinkronisasi berhasil"); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Sumber Data & Integrasi SIPP" subtitle="Konfigurasi pemetaan indikator ke sumber data (SIPP baca-saja / manual)"
        actions={isAdmin(user) && <div className="flex gap-2">
          <Button variant="outline" onClick={sync} data-testid="sipp-sync-button"><RefreshCw className="mr-1 h-4 w-4" /> Uji Sinkron SIPP</Button>
          <Button onClick={() => { setForm(EMPTY); setOpen(true); }} data-testid="add-mapping-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><Plus className="mr-1 h-4 w-4" /> Tambah Pemetaan</Button>
        </div>} />

      <Tabs defaultValue="mapping">
        <TabsList><TabsTrigger value="mapping" data-testid="tab-mapping">Pemetaan Data</TabsTrigger><TabsTrigger value="sources" data-testid="tab-sources">Sumber Data</TabsTrigger><TabsTrigger value="sipp" data-testid="tab-sipp">Referensi Proses SIPP</TabsTrigger></TabsList>

        <TabsContent value="mapping" className="pt-4">
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
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button onClick={save} data-testid="save-mapping-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
