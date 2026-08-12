import { useEffect, useState } from "react";
import { Plus, Lock, Unlock } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, isAdmin } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const PTYPES = ["Bulanan", "Triwulanan", "Semesteran", "Tahunan"];
const EMPTY = { year: new Date().getFullYear(), period_type: "Triwulanan", period_name: "", start_date: "", end_date: "", status: "Open" };

export default function Periode() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [lockTarget, setLockTarget] = useState(null);

  const load = () => api.get("/periods").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.period_name) return toast.error("Nama periode wajib diisi");
    try { await api.post("/periods", { ...form, year: Number(form.year) }); toast.success("Periode dibuat"); setOpen(false); setForm(EMPTY); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const doLock = async () => {
    try { const { data } = await api.patch(`/periods/${lockTarget.id}/lock`); toast.success(`Periode ${data.status === "Locked" ? "dikunci" : "dibuka"}`); setLockTarget(null); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title="Periode Pelaporan" subtitle="Kelola periode pelaporan kinerja & mekanisme penguncian data"
        actions={isAdmin(user) && <Button onClick={() => { setForm(EMPTY); setOpen(true); }} data-testid="add-period-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><Plus className="mr-1 h-4 w-4" /> Tambah Periode</Button>} />
      <Card><CardContent className="px-0 py-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Tahun</TableHead><TableHead>Periode</TableHead><TableHead>Tipe</TableHead><TableHead>Mulai</TableHead><TableHead>Selesai</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((p, i) => (
              <TableRow key={p.id} data-testid={`period-row-${i}`}>
                <TableCell className="font-mono">{p.year}</TableCell>
                <TableCell className="font-medium">{p.period_name}</TableCell>
                <TableCell className="text-sm text-slate-500">{p.period_type}</TableCell>
                <TableCell className="font-mono text-xs">{p.start_date}</TableCell>
                <TableCell className="font-mono text-xs">{p.end_date}</TableCell>
                <TableCell className="text-center"><StatusBadge status={p.status} /></TableCell>
                <TableCell className="text-right">
                  {isAdmin(user) && <Button size="sm" variant="outline" onClick={() => setLockTarget(p)} data-testid={`period-lock-toggle-${i}`}>
                    {p.status === "Locked" ? <><Unlock className="mr-1 h-4 w-4" /> Buka</> : <><Lock className="mr-1 h-4 w-4" /> Kunci</>}
                  </Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>Tambah Periode</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tahun</Label><Input type="number" value={form.year} onChange={(e) => set("year", e.target.value)} className="mt-1 font-mono" /></div>
              <div><Label>Tipe</Label><Select value={form.period_type} onValueChange={(v) => set("period_type", v)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{PTYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label>Nama Periode</Label><Input data-testid="period-name" value={form.period_name} onChange={(e) => set("period_name", e.target.value)} placeholder="cth: Triwulan I 2026" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Mulai</Label><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} className="mt-1" /></div>
              <div><Label>Selesai</Label><Input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button onClick={save} data-testid="save-period-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!lockTarget} onOpenChange={(o) => !o && setLockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{lockTarget?.status === "Locked" ? "Buka kunci periode?" : "Kunci periode?"}</AlertDialogTitle>
            <AlertDialogDescription>{lockTarget?.status === "Locked" ? "Data periode dapat diedit kembali." : "Pengguna biasa tidak dapat mengubah data pada periode terkunci."}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Batal</AlertDialogCancel><AlertDialogAction onClick={doLock} data-testid="confirm-lock-period" className="bg-[#D97706] hover:bg-[#b45309]">Ya, Lanjutkan</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
