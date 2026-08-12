import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, isAdmin } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

const EMPTY = { employee_number: "", name: "", position: "", unit: "", email: "", phone: "", active: true };

export default function PenanggungJawab() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/officers").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const openNew = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (o) => { setEditing(o); setForm(o); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.employee_number) return toast.error("NIP dan nama wajib diisi");
    try {
      if (editing) await api.put(`/officers/${editing.id}`, form);
      else await api.post("/officers", form);
      toast.success("Data penanggung jawab tersimpan"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { try { await api.delete(`/officers/${id}`); toast.success("Dihapus"); load(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Penanggung Jawab Indikator" subtitle="Master pejabat/petugas penanggung jawab kinerja"
        actions={isAdmin(user) && <Button onClick={openNew} data-testid="add-officer-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><Plus className="mr-1 h-4 w-4" /> Tambah</Button>} />
      <Card><CardContent className="px-0 py-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>NIP</TableHead><TableHead>Nama</TableHead><TableHead>Jabatan</TableHead><TableHead>Unit</TableHead><TableHead>Kontak</TableHead><TableHead className="text-center">Indikator</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((o, i) => (
              <TableRow key={o.id} data-testid={`officer-row-${i}`}>
                <TableCell className="font-mono text-xs">{o.employee_number}</TableCell>
                <TableCell className="font-medium">{o.name}</TableCell>
                <TableCell className="text-sm text-slate-500">{o.position}</TableCell>
                <TableCell className="text-sm text-slate-500">{o.unit}</TableCell>
                <TableCell className="text-xs text-slate-500">{o.email}<br />{o.phone}</TableCell>
                <TableCell className="text-center"><Badge variant="outline"><Link2 className="mr-1 h-3 w-3" />{o.indicator_count}</Badge></TableCell>
                <TableCell className="text-center"><Badge className={o.active ? "bg-emerald-600 text-white" : "bg-slate-400 text-white"}>{o.active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  {isAdmin(user) && <Button size="icon" variant="ghost" onClick={() => openEdit(o)} data-testid={`edit-officer-${i}`}><Pencil className="h-4 w-4" /></Button>}
                  {isAdmin(user) && <Button size="icon" variant="ghost" onClick={() => del(o.id)} data-testid={`delete-officer-${i}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} Penanggung Jawab</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>NIP</Label><Input data-testid="officer-nip" value={form.employee_number} onChange={(e) => set("employee_number", e.target.value)} className="mt-1 font-mono" /></div>
              <div><Label>Nama</Label><Input data-testid="officer-name" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Jabatan</Label><Input value={form.position} onChange={(e) => set("position", e.target.value)} className="mt-1" /></div>
              <div><Label>Unit</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" /></div>
              <div><Label>Telepon</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => set("active", v)} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button onClick={save} data-testid="save-officer-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
