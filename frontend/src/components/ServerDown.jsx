import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { WifiOff, RefreshCw, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getApiBase } from "@/lib/api";

// Global overlay shown when the backend server cannot be reached.
// Never crashes the app; offers Retry and Settings actions.
export default function ServerDown() {
  const [down, setDown] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onDown = (e) => setDown({ url: e.detail?.url || "" });
    window.addEventListener("kintrack:server-down", onDown);
    return () => window.removeEventListener("kintrack:server-down", onDown);
  }, []);

  const retry = async () => {
    setRetrying(true);
    let ok = false;
    try {
      const base = down?.url || (await getApiBase());
      if (window.kintrack?.testApiUrl) {
        const res = await window.kintrack.testApiUrl(base);
        ok = !!res?.ok;
      } else {
        const res = await fetch(`${base}/health`, { cache: "no-store" });
        ok = res.ok;
      }
    } catch {}
    if (ok) {
      setDown(null);
      window.location.reload();
      return;
    }
    setRetrying(false);
  };

  if (!down) return null;

  return (
    <div
      data-testid="server-down-overlay"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
    >
      <div className="mx-4 w-full max-w-md rounded-xl bg-white p-8 shadow-2xl dark:bg-slate-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950">
          <WifiOff className="h-7 w-7 text-rose-600" />
        </div>
        <h2 className="text-center font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Server tidak dapat dihubungi.
        </h2>
        <div className="mt-4 space-y-1.5 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800">
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Server</span>
            <span data-testid="server-down-url" className="break-all text-right font-mono text-xs text-slate-800 dark:text-slate-200">
              {down.url || "-"}
            </span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Status</span>
            <span data-testid="server-down-status" className="font-semibold text-rose-600">
              Tidak terhubung
            </span>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">
          Periksa koneksi jaringan/internet Anda, atau ubah alamat server di Pengaturan.
        </p>
        <div className="mt-5 flex gap-2">
          <Button
            data-testid="server-down-retry-btn"
            onClick={retry}
            disabled={retrying}
            className="flex-1 bg-[#0F4C3A] hover:bg-[#0B3B2D]"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
            Coba Lagi
          </Button>
          <Button
            data-testid="server-down-settings-btn"
            variant="outline"
            onClick={() => {
              setDown(null);
              navigate("/pengaturan-server");
            }}
          >
            <Settings className="mr-2 h-4 w-4" />
            Pengaturan
          </Button>
        </div>
        <button
          data-testid="server-down-dismiss-btn"
          onClick={() => setDown(null)}
          className="mx-auto mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
        >
          <X className="h-3 w-3" /> Tutup
        </button>
      </div>
    </div>
  );
}
