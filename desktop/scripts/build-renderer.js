// Builds the React frontend (../frontend) in production mode, then copies the
// output into ./renderer so electron-builder can package it locally.
const { spawnSync } = require("child_process");
const path = require("path");

const frontendDir = path.resolve(__dirname, "..", "..", "frontend");
const isWin = process.platform === "win32";

const pm = isWin ? "yarn.cmd" : "yarn";
console.log("Building React frontend in", frontendDir);
const res = spawnSync(pm, ["build"], { cwd: frontendDir, stdio: "inherit" });
if (res.status !== 0) {
  console.error("Frontend build failed (exit", res.status, ")");
  process.exit(res.status || 1);
}

require("./copy-renderer.js");
