import { useEffect, useState, useRef } from "react";
import { Save, Calculator, Send, CheckCheck, Lock, ShieldCheck, DatabaseZap, Upload, FileText, Trash2, Download, Paperclip } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { useAuth, canEdit, isAdmin } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const STEPS = ["draft", "submitted", "verified", "approved", "locked"];
const STEP_LABEL = { draft: "Draft", submitted: "Diajukan", verified: "Diverifikasi", approved: "Disetujui", locked: "Dikunci" };

export default function InputData() {
  const { user } = useAuth();
  const [indicators, setIndicators] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [indId, setIndId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [ind, setInd] = useState(null);
  const [entry, setEntry] = useState(null);
  const [form, setForm] = useState({});
  const [calc, setCalc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [mapped, setMapped] = useState(false);
  const fileRef = useRef(null);

  const loadDocs = (id) => api.get(`/data-entries/${id}/documents`).then((r) => setDocs(r.data)).catch(() => setDocs([]));

  useEffect(() => {
    api.get("/indicators", { params: { active: true } }).then((r) => setIndicators(r.data));
    api.get("/periods").then((r) => setPeriods(r.data));
  }, []);

  useEffect(() => {
    if (!indId) return;
    const found = indicators.find((i) => i.id === indId);
    setInd(found);
  }, [indId, indicators]);

  useEffect(() => {
    setCalc(null);
    setDocs([]);
    if (!indId || !periodId) { setEntry(null); setForm({}); return; }
    api.get("/data-entries/one", { params: { indicator_id: indId, period_id: periodId } }).then((r) => {
      if (r.data) { setEntry(r.data); setForm(r.data); loadDocs(r.data.id); }
      else { setEntry(null); setForm({}); }
    });
  }, [indId, periodId]);

  useEffect(() => {
    if (!indId) { setMapped(false); return; }
    api.get("/mappings", { params: { indicator_id: indId } })
      .then((r) => setMapped(r.data.some((m) => m.source_code === "SIPP" && (m.numerator_query || m.denominator_query))))
      .catch(() => setMapped(false));
  }, [indId]);

  const ct = ind?.calculation_type;
  const setNum = (k, field, v) => setForm((f) => ({ ...f, [k]: { ...(f[k] || {}), [field]: v } }));
  const setComp = (i, field, v) => {
    const comps = form.components ? [...form.components] : (ind.components || []).map((c) => ({ ...c }));
    comps[i] = { ...comps[i], [field]: v };
    setForm((f) => ({ ...f, components: comps }));
  };
  const compRows = form.components || (ind?.components || []).map((c) => ({ ...c, score: "" }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { indicator_id: indId, period_id: periodId,
        numerator: form.numerator, denominator: form.denominator,
        components: form.components || (ct === "composite" || ct === "weighted_score" ? compRows : undefined),
        survey: form.survey, manual: form.manual, adjustment: form.adjustment, notes: form.notes };
      const { data } = await api.post("/data-entries", payload);
      toast.success("Data tersimpan");
      const r = await api.get("/data-entries/one", { params: { indicator_id: indId, period_id: periodId } });
      setEntry(r.data); setForm(r.data);
      return data.id;
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  const saveAndCalc = async () => {
    const id = await save();
    if (!id) return;
    try {
      const { data } = await api.post(`/data-entries/${id}/calculate`);
      setCalc(data);
      toast.success(`Hasil: ${data.result != null ? data.result : "N/A"} — ${data.status}`);
    } catch (e) { toast.error(apiError(e)); }
  };

  const advance = async () => {
    if (!entry) return;
    try { const { data } = await api.post(`/data-entries/${entry.id}/advance`); toast.success(`Status → ${STEP_LABEL[data.status]}`);
      setEntry({ ...entry, status: data.status }); }
    catch (e) { toast.error(apiError(e)); }
  };

  const pullSipp = async () => {
    setSaving(true);
    try {
      if (window.kintrack?.sippQuery) {
        // Desktop app: query SIPP directly from the local network, then store results
        const { data: mappings } = await api.get("/mappings", { params: { indicator_id: indId } });
        const m = mappings.find((x) => x.source_code === "SIPP" && (x.numerator_query || x.denominator_query));
        if (!m) { toast.error("Pemetaan query SIPP (numerator/denominator) belum diatur untuk indikator ini"); return; }
        const { data: cfg } = await api.get("/sipp/connection/full");
        let num = null, den = null;
        try {
          if (m.numerator_query) num = await window.kintrack.sippQuery(cfg, m.numerator_query);
          if (m.denominator_query) den = await window.kintrack.sippQuery(cfg, m.denominator_query);
        } catch (qe) {
          toast.error((qe?.message || String(qe)).replace(/^Error invoking remote method '.*?': Error: /, ""));
          return;
        }
        await api.post("/sipp/pull-values", { indicator_id: indId, period_id: periodId, numerator: num, denominator: den });
        toast.success(`Data ditarik dari SIPP (desktop) — Pembilang: ${num ?? "-"}, Penyebut: ${den ?? "-"}`);
      } else {
        const { data } = await api.post("/sipp/pull", { indicator_id: indId, period_id: periodId });
        toast.success(`Data ditarik dari SIPP — Pembilang: ${data.numerator ?? "-"}, Penyebut: ${data.denominator ?? "-"}`);
      }
      const r = await api.get("/data-entries/one", { params: { indicator_id: indId, period_id: periodId } });
      setEntry(r.data); setForm(r.data); if (r.data) loadDocs(r.data.id);
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  const uploadDoc = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    let id = entry?.id;
    if (!id) { id = await save(); if (!id) return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/data-entries/${id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Dokumen terunggah");
      loadDocs(id);
    } catch (err) { toast.error(apiError(err)); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const downloadDoc = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = doc.original_filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); }
  };

  const deleteDoc = async (docId) => {
    try { await api.delete(`/documents/${docId}`); toast.success("Dokumen dihapus"); if (entry) loadDocs(entry.id); }
    catch (e) { toast.error(apiError(e)); }
  };

  const curStep = entry ? STEPS.indexOf(entry.status || "draft") : 0;

  return (
    <div>
      <PageHeader title="Input Data Indikator" subtitle="Form input menyesuaikan tipe indikator secara dinamis" />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <Label>Indikator</Label>
            <Select value={indId} onValueChange={setIndId}>
              <SelectTrigger className="mt-1" data-testid="select-indicator"><SelectValue placeholder="Pilih indikator" /></SelectTrigger>
              <SelectContent>{indicators.map((i) => <SelectItem key={i.id} value={i.id}>{i.indicator_code} — {i.short_name || i.indicator_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Periode Pelaporan</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger className="mt-1" data-testid="select-period"><SelectValue placeholder="Pilih periode" /></SelectTrigger>
              <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.period_name} {p.status === "Locked" ? "🔒" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {ind && periodId && (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-base">{ind.indicator_code} — {ind.indicator_name}</CardTitle>
              <div className="flex items-center gap-2">
                <StatusBadge status={entry?.status || "draft"} />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-md bg-slate-50 p-3 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{ind.formula_description}</div>

              {/* PERCENTAGE / RATIO */}
              {(ct === "percentage" || ct === "ratio") && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <Label className="text-sm font-semibold">Pembilang (Numerator)</Label>
                    <p className="mb-2 text-xs text-slate-400">{ind.numerator_definition}</p>
                    <Input type="number" data-testid="input-numerator" placeholder="Nilai" value={form.numerator?.value ?? ""} onChange={(e) => setNum("numerator", "value", e.target.value)} className="font-mono" />
                    <Input placeholder="Sumber data" value={form.numerator?.source ?? ""} onChange={(e) => setNum("numerator", "source", e.target.value)} className="mt-2 text-sm" />
                  </div>
                  <div className="rounded-lg border p-4">
                    <Label className="text-sm font-semibold">Penyebut (Denominator)</Label>
                    <p className="mb-2 text-xs text-slate-400">{ind.denominator_definition}</p>
                    <Input type="number" data-testid="input-denominator" placeholder="Nilai" value={form.denominator?.value ?? ""} onChange={(e) => setNum("denominator", "value", e.target.value)} className="font-mono" />
                    <Input placeholder="Sumber data" value={form.denominator?.source ?? ""} onChange={(e) => setNum("denominator", "source", e.target.value)} className="mt-2 text-sm" />
                  </div>
                </div>
              )}

              {/* COMPOSITE */}
              {(ct === "composite" || ct === "weighted_score") && (
                <Table>
                  <TableHeader><TableRow><TableHead>Komponen</TableHead><TableHead className="text-right">Skor</TableHead><TableHead className="text-right">Bobot</TableHead><TableHead className="text-right">Kontribusi</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {compRows.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell><div className="font-medium">{c.name}</div>{c.group && <div className="text-xs text-slate-400">{c.group}</div>}</TableCell>
                        <TableCell className="text-right"><Input type="number" data-testid={`comp-score-${i}`} value={c.score ?? ""} onChange={(e) => setComp(i, "score", e.target.value)} className="ml-auto w-24 text-right font-mono" /></TableCell>
                        <TableCell className="text-right font-mono">{c.weight}%</TableCell>
                        <TableCell className="text-right font-mono text-emerald-700">{c.score ? (Number(c.score) * Number(c.weight) / 100).toFixed(2) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* SURVEY */}
              {ct === "survey" && (
                <div className="space-y-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div><Label>Jumlah Responden</Label><Input type="number" data-testid="survey-respondents" value={form.survey?.respondents ?? ""} onChange={(e) => setNum("survey", "respondents", e.target.value)} className="mt-1 font-mono" /></div>
                    <div><Label>Indeks Manual (opsional)</Label><Input type="number" step="0.01" data-testid="survey-manual" value={form.survey?.manual_index ?? ""} onChange={(e) => setNum("survey", "manual_index", e.target.value)} className="mt-1 font-mono" /></div>
                  </div>
                  <p className="text-xs text-slate-400">Isi indeks manual, atau kosongkan untuk menghitung rata-rata skor unsur (masukkan via integrasi survei).</p>
                </div>
              )}

              {/* MANUAL */}
              {["manual", "count", "score"].includes(ct) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Nilai</Label><Input type="number" step="0.01" data-testid="input-manual-value" value={form.manual?.value ?? ""} onChange={(e) => setNum("manual", "value", e.target.value)} className="mt-1 font-mono" /></div>
                  <div><Label>Sumber</Label><Input value={form.manual?.source ?? ""} onChange={(e) => setNum("manual", "source", e.target.value)} className="mt-1" /></div>
                  <div className="sm:col-span-2"><Label>Catatan / Dokumen Pendukung</Label><Textarea value={form.manual?.notes ?? ""} onChange={(e) => setNum("manual", "notes", e.target.value)} className="mt-1" rows={2} /></div>
                </div>
              )}

              {canEdit(user) && (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button onClick={save} disabled={saving} variant="outline" data-testid="input-data-save-button"><Save className="mr-1 h-4 w-4" /> Simpan Draft</Button>
                  <Button onClick={saveAndCalc} disabled={saving} className="bg-[#0F4C3A] hover:bg-[#0B3B2D]" data-testid="input-data-calculate-button"><Calculator className="mr-1 h-4 w-4" /> Simpan & Hitung</Button>
                  {(ct === "percentage" || ct === "ratio") && mapped && (
                    <Button onClick={pullSipp} disabled={saving} variant="outline" className="border-amber-500 text-amber-700 hover:bg-amber-50" data-testid="pull-sipp-button"><DatabaseZap className="mr-1 h-4 w-4" /> Tarik dari SIPP</Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Calculation result */}
          {calc && (
            <Card className="mt-4 border-l-4 border-l-emerald-600">
              <CardHeader className="pb-2"><CardTitle className="text-base">Hasil Perhitungan</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-4">
                <div><div className="text-xs uppercase text-slate-400">Hasil</div><div className="font-mono text-2xl font-bold text-[#0F4C3A]">{calc.result != null ? calc.result : "N/A"}{ind.unit === "%" ? "%" : ""}</div></div>
                <div><div className="text-xs uppercase text-slate-400">Target</div><div className="font-mono text-2xl font-bold">{calc.target ?? "-"}</div></div>
                <div><div className="text-xs uppercase text-slate-400">Gap</div><div className="font-mono text-2xl font-bold">{calc.gap != null ? calc.gap : "-"}</div></div>
                <div><div className="text-xs uppercase text-slate-400">Status</div><div className="mt-1"><StatusBadge status={calc.status} /></div></div>
                {calc.note && <div className="sm:col-span-4 text-sm text-amber-600">{calc.note}</div>}
              </CardContent>
            </Card>
          )}

          {/* Workflow */}
          {entry && (
            <Card className="mt-4">
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-emerald-600" />Alur Persetujuan</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-2">
                  {STEPS.map((s, i) => (
                    <div key={s} className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${i <= curStep ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"}`}>
                        {i <= curStep && <CheckCheck className="h-3 w-3" />} {STEP_LABEL[s]}
                      </div>
                      {i < STEPS.length - 1 && <div className={`h-0.5 w-6 ${i < curStep ? "bg-emerald-600" : "bg-slate-200"}`} />}
                    </div>
                  ))}
                </div>
                {canEdit(user) && entry.status !== "locked" && (
                  <Button onClick={advance} className="mt-4 bg-[#D97706] hover:bg-[#b45309]" data-testid="approval-advance-button">
                    {entry.status === "draft" && <><Send className="mr-1 h-4 w-4" /> Ajukan</>}
                    {entry.status === "submitted" && <><CheckCheck className="mr-1 h-4 w-4" /> Verifikasi</>}
                    {entry.status === "verified" && <><CheckCheck className="mr-1 h-4 w-4" /> Setujui</>}
                    {entry.status === "approved" && <><Lock className="mr-1 h-4 w-4" /> Kunci</>}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* Supporting Documents */}
          {entry && (
            <Card className="mt-4">
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4 text-emerald-600" />Dokumen Pendukung</CardTitle>
                {canEdit(user) && (
                  <div>
                    <input ref={fileRef} type="file" hidden onChange={uploadDoc} data-testid="document-file-input"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.csv,.txt" />
                    <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()} data-testid="upload-document-button">
                      <Upload className="mr-1 h-4 w-4" /> {uploading ? "Mengunggah…" : "Unggah"}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                {docs.length ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between py-2" data-testid={`document-row-${d.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{d.original_filename}</div>
                            <div className="text-xs text-slate-400">{(d.size / 1024).toFixed(0)} KB · diunggah oleh {d.uploaded_by}</div>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="icon" variant="ghost" onClick={() => downloadDoc(d)} data-testid={`download-document-${d.id}`}><Download className="h-4 w-4" /></Button>
                          {canEdit(user) && <Button size="icon" variant="ghost" onClick={() => deleteDoc(d.id)} data-testid={`delete-document-${d.id}`}><Trash2 className="h-4 w-4 text-rose-500" /></Button>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="py-4 text-center text-sm text-slate-400">Belum ada dokumen. Unggah bukti pendukung (PDF, gambar, Excel — maks 10 MB).</p>}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
