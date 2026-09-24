import axios from "axios";

export const isDesktop = typeof window !== "undefined" && !!window.kintrack;

const DEFAULT_API = "http://localhost:8001/api";
let cachedBase = null;

function normalize(url) {
  let u = (url || "").trim().replace(/\/+$/, "");
  if (u && !/\/api$/i.test(u)) u += "/api";
  return u;
}

// Resolve the backend base URL at runtime. In the desktop app this comes from
// the Electron config store (user-configurable), NOT the build-time env var.
export async function getApiBase() {
  if (cachedBase) return cachedBase;
  if (isDesktop) {
    cachedBase = localStorage.getItem("kintrack_api_url") || null;
    try {
      const url = await window.kintrack.getApiUrl();
      if (url) {
        cachedBase = normalize(url);
        localStorage.setItem("kintrack_api_url", cachedBase);
      }
    } catch {}
    if (!cachedBase) cachedBase = DEFAULT_API;
    return cachedBase;
  }
  cachedBase = normalize(process.env.REACT_APP_BACKEND_URL);
  return cachedBase;
}

export function clearApiCache() {
  cachedBase = null;
  localStorage.removeItem("kintrack_api_url");
}

const api = axios.create();

api.interceptors.request.use(async (config) => {
  config.baseURL = await getApiBase();
  const token = localStorage.getItem("kintrack_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (!err.response && !window.location.pathname.includes("pengaturan-server")) {
      window.dispatchEvent(
        new CustomEvent("kintrack:server-down", { detail: { url: err.config?.baseURL || "" } })
      );
    }
    if (err.response?.status === 401 && !window.location.pathname.includes("login")) {
      localStorage.removeItem("kintrack_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export function apiError(err) {
  if (!err?.response) return "Server tidak dapat dihubungi.";
  const d = err.response.data?.detail;
  if (d == null) return "Terjadi kesalahan. Silakan coba lagi.";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => e?.msg || JSON.stringify(e)).join(" ");
  return String(d);
}

export default api;
