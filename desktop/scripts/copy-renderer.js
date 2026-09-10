// Copies the production React build (../frontend/build) into ./renderer
// so electron-builder can package the UI locally inside the app.
const fs = require("fs");
const path = require("path");

const src = path.resolve(__dirname, "..", "..", "frontend", "build");
const dest = path.resolve(__dirname, "..", "renderer");

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(src)) {
  console.error("ERROR: frontend build not found at", src);
  console.error("Run `yarn build` inside the frontend folder first.");
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
copyDir(src, dest);
console.log("Renderer copied:", src, "->", dest);
