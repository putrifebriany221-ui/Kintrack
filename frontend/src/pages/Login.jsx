import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Scale, Loader2 } from "lucide-react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.access_token, data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Visual side */}
      <div className="relative hidden lg:block">
        <img
          src="https://images.unsplash.com/photo-1618771623063-6c3faa854a61?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200"
          alt="Palu Hakim"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0F4C3A] via-[#0F4C3A]/70 to-[#0F4C3A]/30" />
        <div className="absolute bottom-0 left-0 p-12 text-white">
          <Scale className="mb-4 h-12 w-12 text-amber-400" />
          <h2 className="font-display text-3xl font-extrabold leading-tight">
            Sistem Tracking Kinerja
          </h2>
          <p className="mt-2 max-w-md text-emerald-100/90">
            Pengelolaan, perhitungan, dan pelaporan indikator kinerja Pengadilan Negeri Sukadana.
          </p>
        </div>
      </div>

      {/* Form side */}
      <div className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#0F4C3A]">
              <Scale className="h-6 w-6 text-amber-400" />
            </div>
            <div>
              <div className="font-display text-lg font-extrabold">KINTRACK</div>
              <div className="text-xs text-slate-500">PN Sukadana</div>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
            Masuk ke Akun Anda
          </h1>
          <p className="mt-1 text-sm text-slate-500">Silakan masukkan kredensial Anda.</p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="login-username-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@pn-sukadana.go.id"
                required
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="password">Kata Sandi</Label>
              <Input
                id="password"
                data-testid="login-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="mt-1.5"
              />
            </div>
            {error && (
              <div data-testid="login-error" className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </div>
            )}
            <Button
              type="submit"
              data-testid="login-submit-button"
              disabled={loading}
              className="w-full bg-[#0F4C3A] hover:bg-[#0B3B2D]"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Masuk
            </Button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-4 text-center dark:border-slate-800">
            <a
              href={`${process.env.REACT_APP_BACKEND_URL}/api/download/windows`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold text-[#0F4C3A] hover:underline dark:text-emerald-400"
              data-testid="download-windows-login-link"
            >
              <Scale className="h-4 w-4 text-amber-500" />
              Unduh Aplikasi Desktop Windows 11 (Portable .exe / Zip)
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
