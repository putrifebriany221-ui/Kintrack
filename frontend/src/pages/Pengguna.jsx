import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const EMPTY = { email: "", password: "", name: "", role: "viewer", position: "", active: true };

export default function Pengguna() {
  const [items, setItems] = useState([]);
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/users").then((r) => setItems(r.data));
  useEffect(() => { load(); api.get("/roles").then((r) => setRoles(r.data)); }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.email || !form.name) return toast.error("Email dan nama wajib diisi");
    try {
      if (editing) await api.put(`/users/${editing.id}`, form);
      else await api.post("/users", form);
      toast.success("Pengguna tersimpan"); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const del = async (id) => { try { await api.delete(`/users/${id}`); toast.success("Dihapus"); load(); } catch (e) { toast.error(apiError(e)); } };

  return (
    <div>
      <PageHeader title="Manajemen Pengguna" subtitle="Kelola akun & peran pengguna sistem"
        actions={<Button onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }} data-testid="add-user-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><Plus className="mr-1 h-4 w-4" /> Tambah Pengguna</Button>} />
      <Card><CardContent className="px-0 py-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead>Nama</TableHead><TableHead>Email</TableHead><TableHead>Peran</TableHead><TableHead>Jabatan</TableHead><TableHead className="text-center">Status</TableHead><TableHead className="text-right">Aksi</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((u, i) => (
              <TableRow key={u.id} data-testid={`user-row-${i}`}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-sm text-slate-500">{u.email}</TableCell>
                <TableCell><Badge variant="outline">{u.role_label}</Badge></TableCell>
                <TableCell className="text-sm text-slate-500">{u.position || "-"}</TableCell>
                <TableCell className="text-center"><Badge className={u.active ? "bg-emerald-600 text-white" : "bg-slate-400 text-white"}>{u.active ? "Aktif" : "Nonaktif"}</Badge></TableCell>
                <TableCell><div className="flex justify-end gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(u); setForm({ ...u, password: "" }); setOpen(true); }} data-testid={`edit-user-${i}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => del(u.id)} data-testid={`delete-user-${i}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent><DialogHeader><DialogTitle>{editing ? "Edit" : "Tambah"} Pengguna</DialogTitle>
          <DialogDescription>{editing ? "Kosongkan kata sandi jika tidak ingin mengubah." : "Isi data akun pengguna baru."}</DialogDescription></DialogHeader>
          <div className="grid gap-3 py-2">
            <div><Label>Nama</Label><Input data-testid="user-name" value={form.name} onChange={(e) => set("name", e.target.value)} className="mt-1" /></div>
            <div><Label>Email</Label><Input data-testid="user-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" /></div>
            <div><Label>Kata Sandi {editing && "(opsional)"}</Label><Input data-testid="user-password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Peran</Label><Select value={form.role} onValueChange={(v) => set("role", v)}><SelectTrigger className="mt-1" data-testid="user-role"><SelectValue /></SelectTrigger><SelectContent>{roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Jabatan</Label><Input value={form.position} onChange={(e) => set("position", e.target.value)} className="mt-1" /></div>
            </div>
            <div className="flex items-center gap-2"><Switch checked={form.active} onCheckedChange={(v) => set("active", v)} /><Label>Aktif</Label></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Batal</Button><Button onClick={save} data-testid="save-user-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">Simpan</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
