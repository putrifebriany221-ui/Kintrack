import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Pencil, Power, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, isAdmin, can } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import IndicatorForm from "@/components/IndicatorForm";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function Indikator() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [cats, setCats] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [delTarget, setDelTarget] = useState(null);
  const navigate = useNavigate();

  const load = () => api.get("/indicators", { params: q ? { q } : {} }).then((r) => setItems(r.data));
  useEffect(() => { load(); }, [q]);
  useEffect(() => { api.get("/categories").then((r) => setCats(r.data)); }, []);

  const toggle = async (id) => {
    try { await api.patch(`/indicators/${id}/toggle`); toast.success("Status indikator diperbarui"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const doDelete = async () => {
    try { await api.delete(`/indicators/${delTarget.id}`); toast.success("Indikator dihapus"); setDelTarget(null); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader
        title="Master Indikator"
        subtitle="Kelola 17 indikator kinerja utama secara konfiguratif — tanpa mengubah kode program"
        actions={isAdmin(user) && (
          <Button data-testid="add-indicator-button" onClick={() => { setEditing(null); setFormOpen(true); }} className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">
            <Plus className="mr-1 h-4 w-4" /> Tambah Indikator
          </Button>
        )}
      />

      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input data-testid="indicator-search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode / nama indikator…" className="pl-9" />
      </div>

      <Card>
        <CardContent className="px-0 py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Kode</TableHead>
                  <TableHead>Nama Indikator</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((it, i) => (
                  <TableRow key={it.id} data-testid={`indicator-row-${i}`}>
                    <TableCell className="font-mono font-semibold text-[#0F4C3A]">{it.indicator_code}</TableCell>
                    <TableCell className="max-w-[360px]">
                      <div className="font-medium text-slate-800 dark:text-slate-200">{it.indicator_name}</div>
                      <div className="text-xs text-slate-400">{it.officers?.map((o) => o.name).join(", ") || "Belum ada PJ"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">{it.category_name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[11px]">{it.indicator_type}</Badge></TableCell>
                    <TableCell className="text-right font-mono">{it.target_value ?? "-"} {it.unit}</TableCell>
                    <TableCell className="text-center">
                      <Badge className={it.active_status ? "bg-emerald-600 text-white" : "bg-slate-400 text-white"}>
                        {it.active_status ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" data-testid={`view-indicator-${i}`} onClick={() => navigate(`/indikator/${it.id}`)}><Eye className="h-4 w-4" /></Button>
                        {isAdmin(user) && <Button size="icon" variant="ghost" data-testid={`edit-indicator-${i}`} onClick={() => { setEditing(it); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>}
                        {isAdmin(user) && <Button size="icon" variant="ghost" data-testid={`toggle-indicator-${i}`} onClick={() => toggle(it.id)}><Power className="h-4 w-4" /></Button>}
                        {can(user, "super_admin") && <Button size="icon" variant="ghost" data-testid={`delete-indicator-${i}`} onClick={() => setDelTarget(it)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <IndicatorForm open={formOpen} onOpenChange={setFormOpen} indicator={editing} categories={cats} onSaved={load} />

      <AlertDialog open={!!delTarget} onOpenChange={(o) => !o && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus indikator?</AlertDialogTitle>
            <AlertDialogDescription>Indikator "{delTarget?.indicator_name}" akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction data-testid="confirm-delete-indicator" onClick={doDelete} className="bg-rose-600 hover:bg-rose-700">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
