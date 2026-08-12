import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TYPES = [
  { v: "Percentage", c: "percentage" }, { v: "Ratio", c: "ratio" },
  { v: "Composite Index", c: "composite" }, { v: "Survey Index", c: "survey" },
  { v: "Manual Value", c: "manual" }, { v: "Count", c: "count" },
  { v: "Score", c: "score" }, { v: "Weighted Score", c: "weighted_score" },
];
const OPS = [">=", ">", "=", "<=", "<", "between"];
const FREQ = ["Bulanan", "Triwulanan", "Semesteran", "Tahunan"];

const empty = {
  indicator_code: "", indicator_name: "", short_name: "", description: "", objective: "",
  category_code: "", indicator_type: "Percentage", calculation_type: "percentage",
  formula_description: "", numerator_definition: "", denominator_definition: "",
  unit: "%", target_value: "", target_operator: ">=", data_source: "Manual",
  active_status: true, reporting_frequency: "Triwulanan", components: [],
  allow_numerator_gt_denominator: false, config_extra: {}, notes: "",
};

export default function IndicatorForm({ open, onOpenChange, indicator, categories, onSaved }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (indicator) {
      setForm({ ...empty, ...indicator, target_value: indicator.target_value ?? "", components: indicator.components || [] });
    } else setForm(empty);
  }, [indicator, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const setType = (v) => {
    const t = TYPES.find((x) => x.v === v);
    setForm((f) => ({ ...f, indicator_type: v, calculation_type: t?.c || "manual" }));
  };
  const addComp = () => set("components", [...form.components, { name: "", weight: 0, group: "" }]);
  const setComp = (i, k, v) => set("components", form.components.map((c, idx) => idx === i ? { ...c, [k]: v } : c));
  const rmComp = (i) => set("components", form.components.filter((_, idx) => idx !== i));

  const isComposite = ["composite", "weighted_score"].includes(form.calculation_type);
  const isPct = ["percentage", "ratio"].includes(form.calculation_type);
  const weightTotal = form.components.reduce((s, c) => s + (Number(c.weight) || 0), 0);

  const save = async () => {
    if (!form.indicator_code || !form.indicator_name) return toast.error("Kode dan nama indikator wajib diisi");
    setSaving(true);
    try {
      const payload = { ...form, target_value: form.target_value === "" ? null : Number(form.target_value),
        components: form.components.map((c) => ({ ...c, weight: Number(c.weight) || 0 })) };
      if (indicator) await api.put(`/indicators/${indicator.id}`, payload);
      else await api.post("/indicators", payload);
      toast.success(indicator ? "Indikator diperbarui" : "Indikator dibuat");
      onOpenChange(false);
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{indicator ? "Edit Indikator" : "Tambah Indikator"}</DialogTitle>
          <DialogDescription>Konfigurasi indikator secara dinamis. Perubahan formula membuat versi formula baru otomatis.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="umum">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="umum" data-testid="tab-umum">Umum</TabsTrigger>
            <TabsTrigger value="formula" data-testid="tab-formula">Formula & Target</TabsTrigger>
            <TabsTrigger value="lanjutan" data-testid="tab-lanjutan">Lanjutan</TabsTrigger>
          </TabsList>

          <TabsContent value="umum" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Kode Indikator *</Label><Input data-testid="form-code" value={form.indicator_code} onChange={(e) => set("indicator_code", e.target.value)} className="mt-1 font-mono" /></div>
              <div><Label>Nama Singkat</Label><Input value={form.short_name} onChange={(e) => set("short_name", e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>Nama Indikator *</Label><Input data-testid="form-name" value={form.indicator_name} onChange={(e) => set("indicator_name", e.target.value)} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kategori</Label>
                <Select value={form.category_code} onValueChange={(v) => set("category_code", v)}>
                  <SelectTrigger className="mt-1" data-testid="form-category"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipe Indikator</Label>
                <Select value={form.indicator_type} onValueChange={setType}>
                  <SelectTrigger className="mt-1" data-testid="form-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((t) => <SelectItem key={t.v} value={t.v}>{t.v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Deskripsi / Tujuan</Label><Textarea value={form.objective} onChange={(e) => set("objective", e.target.value)} className="mt-1" rows={2} /></div>
          </TabsContent>

          <TabsContent value="formula" className="space-y-4 pt-4">
            <div><Label>Deskripsi Formula</Label><Textarea data-testid="form-formula" value={form.formula_description} onChange={(e) => set("formula_description", e.target.value)} className="mt-1 font-mono text-sm" rows={2} /></div>
            {isPct && (
              <div className="grid grid-cols-1 gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div><Label>Definisi Pembilang (Numerator)</Label><Input value={form.numerator_definition} onChange={(e) => set("numerator_definition", e.target.value)} className="mt-1" /></div>
                <div><Label>Definisi Penyebut (Denominator)</Label><Input value={form.denominator_definition} onChange={(e) => set("denominator_definition", e.target.value)} className="mt-1" /></div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.allow_numerator_gt_denominator} onCheckedChange={(v) => set("allow_numerator_gt_denominator", v)} data-testid="form-allow-gt" />
                  <Label>Izinkan pembilang &gt; penyebut / nilai negatif</Label>
                </div>
              </div>
            )}
            {isComposite && (
              <div className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between">
                  <Label>Komponen & Bobot</Label>
                  <span className={`text-xs font-semibold ${Math.abs(weightTotal - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>Total bobot: {weightTotal}%</span>
                </div>
                {form.components.map((c, i) => (
                  <div key={i} className="mb-2 flex gap-2">
                    <Input placeholder="Nama komponen" value={c.name} onChange={(e) => setComp(i, "name", e.target.value)} data-testid={`comp-name-${i}`} />
                    <Input placeholder="Grup" value={c.group || ""} onChange={(e) => setComp(i, "group", e.target.value)} className="w-32" />
                    <Input placeholder="Bobot %" type="number" value={c.weight} onChange={(e) => setComp(i, "weight", e.target.value)} className="w-24" data-testid={`comp-weight-${i}`} />
                    <Button size="icon" variant="ghost" onClick={() => rmComp(i)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addComp} data-testid="add-component-button"><Plus className="mr-1 h-4 w-4" /> Tambah Komponen</Button>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Target</Label><Input data-testid="form-target" type="number" value={form.target_value} onChange={(e) => set("target_value", e.target.value)} className="mt-1 font-mono" /></div>
              <div>
                <Label>Operator</Label>
                <Select value={form.target_operator} onValueChange={(v) => set("target_operator", v)}>
                  <SelectTrigger className="mt-1" data-testid="form-operator"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Satuan</Label><Input value={form.unit} onChange={(e) => set("unit", e.target.value)} className="mt-1" /></div>
            </div>
          </TabsContent>

          <TabsContent value="lanjutan" className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Sumber Data</Label><Input value={form.data_source} onChange={(e) => set("data_source", e.target.value)} className="mt-1" /></div>
              <div>
                <Label>Frekuensi Pelaporan</Label>
                <Select value={form.reporting_frequency} onValueChange={(v) => set("reporting_frequency", v)}>
                  <SelectTrigger className="mt-1" data-testid="form-frequency"><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQ.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Catatan</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="mt-1" rows={2} /></div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active_status} onCheckedChange={(v) => set("active_status", v)} data-testid="form-active" />
              <Label>Indikator Aktif</Label>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button data-testid="save-indicator-button" onClick={save} disabled={saving} className="bg-[#0F4C3A] hover:bg-[#0B3B2D]">
            {saving ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
