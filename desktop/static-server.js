// Minimal SPA static file server using Node built-ins (no external deps).
// Serves the bundled React build with index.html fallback so BrowserRouter works.
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function startServer(rootDir) {
  return new Promise((resolve, reject) => {
    const indexPath = path.join(rootDir, "index.html");

    const server = http.createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
        if (urlPath === "/") urlPath = "/index.html";

        // Prevent path traversal
        const safePath = path
          .normalize(urlPath)
          .replace(/^(\.\.[/\\])+/, "")
          .replace(/^[/\\]+/, "");
        let filePath = path.join(rootDir, safePath);

        if (!filePath.startsWith(rootDir)) {
          return send(res, 403, "Forbidden");
        }

        fs.stat(filePath, (err, stat) => {
          if (err || !stat.isFile()) {
            // SPA fallback -> index.html
            return fs.readFile(indexPath, (e2, data) => {
              if (e2) return send(res, 404, "Not Found");
              send(res, 200, data, { "Content-Type": MIME[".html"] });
            });
          }
          const ext = path.extname(filePath).toLowerCase();
          const type = MIME[ext] || "application/octet-stream";
          const cache = ext === ".html" ? "no-cache" : "public, max-age=31536000";
          fs.readFile(filePath, (e3, data) => {
            if (e3) return send(res, 500, "Read error");
            send(res, 200, data, { "Content-Type": type, "Cache-Control": cache });
          });
        });
      } catch (e) {
        send(res, 500, "Server error");
      }
    });

    // Bind to loopback only, random free port
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        close: () => {
          try {
            server.close();
          } catch (_) {}
        },
      });
    });
    server.on("error", reject);
  });
}

module.exports = { startServer };
