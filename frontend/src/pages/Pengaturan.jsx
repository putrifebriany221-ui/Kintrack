import { useEffect, useState } from "react";
import { Save, ShieldQuestion, ListChecks } from "lucide-react";
import { toast } from "sonner";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Pengaturan() {
  const [settings, setSettings] = useState({});
  const [rules, setRules] = useState([]);
  const [questions, setQuestions] = useState([]);

  useEffect(() => {
    api.get("/settings").then((r) => setSettings(r.data));
    api.get("/business-rules").then((r) => setRules(r.data));
    api.get("/survey/questions").then((r) => setQuestions(r.data));
  }, []);
  const set = (k, v) => setSettings((s) => ({ ...s, [k]: v }));

  const save = async () => {
    try { await api.put("/settings", { app_name: settings.app_name, institution: settings.institution, subtitle: settings.subtitle, default_year: Number(settings.default_year) }); toast.success("Pengaturan tersimpan"); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div>
      <PageHeader title="Pengaturan Sistem" subtitle="Konfigurasi aplikasi, aturan bisnis, dan unsur survei" />
      <Tabs defaultValue="umum">
        <TabsList><TabsTrigger value="umum" data-testid="settings-tab-umum">Umum</TabsTrigger><TabsTrigger value="rules" data-testid="settings-tab-rules">Aturan Bisnis</TabsTrigger><TabsTrigger value="survey" data-testid="settings-tab-survey">Unsur Survei (SKM)</TabsTrigger></TabsList>

        <TabsContent value="umum" className="pt-4">
          <Card><CardContent className="grid max-w-2xl gap-4 p-6">
            <div><Label>Nama Aplikasi</Label><Input value={settings.app_name || ""} onChange={(e) => set("app_name", e.target.value)} className="mt-1" data-testid="setting-app-name" /></div>
            <div><Label>Nama Instansi</Label><Input value={settings.institution || ""} onChange={(e) => set("institution", e.target.value)} className="mt-1" /></div>
            <div><Label>Subjudul</Label><Input value={settings.subtitle || ""} onChange={(e) => set("subtitle", e.target.value)} className="mt-1" /></div>
            <div><Label>Tahun Default</Label><Input type="number" value={settings.default_year || ""} onChange={(e) => set("default_year", e.target.value)} className="mt-1 w-40 font-mono" /></div>
            <div><Button onClick={save} data-testid="save-settings-button" className="bg-[#0F4C3A] hover:bg-[#0B3B2D]"><Save className="mr-1 h-4 w-4" /> Simpan</Button></div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4 pt-4">
          {rules.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldQuestion className="h-4 w-4 text-emerald-600" />{r.name} <Badge variant="outline" className="font-mono">{r.code}</Badge></CardTitle></CardHeader>
              <CardContent>
                <p className="mb-3 text-sm text-slate-500">{r.description}</p>
                <Table>
                  <TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Operator</TableHead><TableHead>Nilai</TableHead></TableRow></TableHeader>
                  <TableBody>{r.criteria?.map((c, i) => (<TableRow key={i}><TableCell className="font-mono text-sm">{c.field}</TableCell><TableCell className="font-mono">{c.operator}</TableCell><TableCell className="font-mono">{String(c.value)}</TableCell></TableRow>))}</TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="survey" className="pt-4">
          <Card><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-emerald-600" />9 Unsur Indeks Kepuasan Masyarakat (SKM)</CardTitle></CardHeader>
            <CardContent className="px-0"><Table>
              <TableHeader><TableRow><TableHead className="w-20">Kode</TableHead><TableHead>Unsur Layanan</TableHead></TableRow></TableHeader>
              <TableBody>{questions.map((q) => (<TableRow key={q.id}><TableCell className="font-mono font-semibold">{q.code}</TableCell><TableCell>{q.label}</TableCell></TableRow>))}</TableBody>
            </Table></CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
