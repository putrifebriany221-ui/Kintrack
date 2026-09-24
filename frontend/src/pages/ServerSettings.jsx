import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Server, Loader2, CheckCircle2, XCircle, FolderOpen, ArrowLeft, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isDesktop, clearApiCache } from "@/lib/api";

// Pengaturan Server + Tentang Aplikasi (desktop). Halaman ini publik agar
// alamat server bisa diubah sebelum login.
export default function ServerSettings() {
  const navigate = useNavigate();
  const [apiUrl, setApiUrl] = useState("");
  const [info, setInfo] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;
    window.kintrack.getApiUrl?.().then((u) => u && setApiUrl(u)).catch(() => {});
    window.kintrack.getInfo?.().then(setInfo).catch(() => {});
  }, []);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      let res;
      if (isDesktop && window.kintrack.testApiUrl) {
        res = await window.kintrack.testApiUrl(apiUrl);
      } else {
        let u = apiUrl.trim().replace(/\/+$/, "");
        if (u && !/\/api$/i.test(u)) u += "/api";
        const r = await fetch(`${u}/health`, { cache: "no-store" });
        res = { ok: r.ok, url: u, error: r.ok ? null : `HTTP ${r.status}` };
      }
      setTestResult(res);
    } catch (e) {
      setTestResult({ ok: false, error: e?.message || "Koneksi gagal" });
    }
    setTesting(false);
  };

  const save = async () => {
    if (!apiUrl.trim()) {
      toast.error("Alamat server wajib diisi");
      return;
    }
    setSaving(true);
    try {
      if (isDesktop) {
        const saved = await window.kintrack.setApiUrl(apiUrl);
        setApiUrl(saved);
        clearApiCache();
        toast.success(`Server tersimpan: ${saved}`);
        setTimeout(() => window.location.reload(), 800);
      } else {
        toast.info("Pengaturan server hanya dapat diubah di aplikasi desktop Windows.");
      }
    } catch {
      toast.error("Gagal menyimpan pengaturan");
    }
    setSaving(false);
  };

  return (
    <div data-testid="server-settings-page" className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="mx-auto max-w-lg space-y-6">
        <button
          data-testid="server-settings-back-btn"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Kembali
        </button>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F4C3A]">
              <Server className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Pengaturan Server
              </h1>
              <p className="text-xs text-slate-500">Alamat API server yang digunakan aplikasi</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="api-url">API Server URL</Label>
              <Input
                id="api-url"
                data-testid="server-url-input"
                value={apiUrl}
                onChange={(e) => {
                  setApiUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder="http://192.168.0.149/api"
                className="mt-1.5 font-mono text-sm"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Contoh: <span className="font-mono">http://192.168.0.149/api</span> atau{" "}
                <span className="font-mono">https://kinerja.pn-sukadana.go.id/api</span>
              </p>
            </div>

            {testResult && (
              <div
                data-testid="server-test-result"
                className={`flex items-start gap-2 rounded-md px-3 py-2 text-sm ${
                  testResult.ok
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                }`}
              >
                {testResult.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                <span>
                  {testResult.ok
                    ? `Terhubung ke server (${testResult.url || apiUrl})`
                    : `Gagal terhubung. ${testResult.error || "Periksa alamat dan koneksi jaringan."}`}
                </span>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                data-testid="server-url-test-btn"
                variant="outline"
                onClick={test}
                disabled={testing || !apiUrl.trim()}
                className="flex-1"
              >
                {testing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Uji Koneksi
              </Button>
              <Button
                data-testid="server-url-save-btn"
                onClick={save}
                disabled={saving || !apiUrl.trim()}
                className="flex-1 bg-[#0F4C3A] hover:bg-[#0B3B2D]"
              >
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Simpan
              </Button>
            </div>

            {!isDesktop && (
              <p className="text-xs text-amber-600">
                Mode browser: alamat server mengikuti konfigurasi build web dan tidak dapat diubah di sini.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0F4C3A]">
              <Scale className="h-5 w-5 text-amber-400" />
            </div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Tentang Aplikasi
            </h2>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Nama</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
                {info?.appName || "Monitoring dan Pelaporan Kinerja PN Sukadana"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Versi</dt>
              <dd data-testid="about-version" className="font-mono text-slate-800 dark:text-slate-200">
                {info?.version || "-"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Platform</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">{info?.platform || "web"}</dd>
            </div>
          </dl>
          {isDesktop && (
            <Button
              data-testid="open-log-folder-btn"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => window.kintrack?.openLogFolder?.()}
            >
              <FolderOpen className="mr-2 h-4 w-4" /> Buka Folder Log
            </Button>
          )}
          <p className="mt-4 text-center text-xs text-slate-400">
            © 2026 Pengadilan Negeri Sukadana
          </p>
        </div>
      </div>
    </div>
  );
}
