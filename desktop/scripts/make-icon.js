// Generates build/icon.ico (and ensures build/icon.png) from build/icon.png.
// Uses png-to-ico. If icon.ico already exists it is regenerated.
const fs = require("fs");
const path = require("path");

const buildDir = path.resolve(__dirname, "..", "build");
const pngPath = path.join(buildDir, "icon.png");
const icoPath = path.join(buildDir, "icon.ico");

async function main() {
  if (!fs.existsSync(pngPath)) {
    console.error("ERROR: build/icon.png not found. Add a 512x512+ PNG at", pngPath);
    process.exit(1);
  }
  const pngToIco = require("png-to-ico");
  try {
    const buf = await pngToIco(pngPath);
    fs.writeFileSync(icoPath, buf);
    console.log("Icon generated:", icoPath);
  } catch (e) {
    console.error("Failed to generate .ico:", e.message);
    process.exit(1);
  }
}

main();
