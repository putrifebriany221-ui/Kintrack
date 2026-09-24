// Runtime configuration store (API server URL) persisted in the userData folder.
// The config survives app updates. It stores NO secrets — only the server address.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULT_API_URL = "http://localhost:8001/api";

function configPath() {
  return path.join(app.getPath("userData"), "kintrack-config.json");
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf-8"));
  } catch (_) {
    return {};
  }
}

function writeConfig(cfg) {
  try {
    fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2));
  } catch (_) {}
}

function normalizeApiUrl(url) {
  let u = String(url || "").trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = "http://" + u;
  if (u && !/\/api$/i.test(u)) u = u + "/api";
  return u;
}

function getApiUrl() {
  const cfg = readConfig();
  return normalizeApiUrl(cfg.apiUrl || process.env.KINTRACK_API_URL || DEFAULT_API_URL);
}

function setApiUrl(url) {
  const cfg = readConfig();
  cfg.apiUrl = normalizeApiUrl(url);
  writeConfig(cfg);
  return cfg.apiUrl;
}

module.exports = { getApiUrl, setApiUrl, normalizeApiUrl, DEFAULT_API_URL };
