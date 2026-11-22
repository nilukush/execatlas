import http from "node:http";
import fs from "node:fs";
import path from "node:path";

// Dependency-free static server for the e2e suite: serves out/ on 4318.
// Node's http module keeps the runner independent of whichever python3
// binary happens to be first on PATH.
const ROOT = path.join(process.cwd(), "out");
const PORT = Number(process.env.E2E_PORT ?? 4318);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  let file = path.join(ROOT, url.pathname);
  if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
  else if (!path.extname(file)) file = `${file}.html`;
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`e2e server on http://127.0.0.1:${PORT}`);
});
