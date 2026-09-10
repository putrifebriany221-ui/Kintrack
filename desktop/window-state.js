// Persists and restores window size/position across launches.
const fs = require("fs");

class WindowState {
  constructor({ file, defaultWidth, defaultHeight }) {
    this.file = file;
    this.defaultWidth = defaultWidth;
    this.defaultHeight = defaultHeight;
    this.state = { width: defaultWidth, height: defaultHeight };
    try {
      const raw = fs.readFileSync(file, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && parsed.width && parsed.height) this.state = parsed;
    } catch (_) {
      // no saved state yet
    }
  }

  get x() { return this.state.x; }
  get y() { return this.state.y; }
  get width() { return this.state.width || this.defaultWidth; }
  get height() { return this.state.height || this.defaultHeight; }

  manage(win) {
    const save = () => {
      try {
        if (win.isDestroyed()) return;
        const isMax = win.isMaximized();
        const bounds = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
        this.state = { ...bounds, isMaximized: isMax };
        fs.writeFileSync(this.file, JSON.stringify(this.state));
      } catch (_) {}
    };
    ["resize", "move", "close"].forEach((ev) => win.on(ev, save));
    if (this.state.isMaximized) win.maximize();
  }
}

module.exports = { WindowState };
