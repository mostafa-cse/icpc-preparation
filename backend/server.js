#!/usr/bin/env node
/**
 * ICPC Preparation Development Server
 * Fast, zero-dependency static server with proper MIME types and route resolution.
 *
 * Usage:
 *   node backend/server.js
 *   PORT=3000 node backend/server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.PORT || "8085", 10);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT_DIR = path.resolve(__dirname, "..");
const FRONTEND_DIR = path.join(ROOT_DIR, "frontend");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
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
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  // Extract URL pathname without query string or hash
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  // Security check: prevent directory traversal
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");

  // Candidate file paths: check root first, then frontend/
  let filePath = path.join(ROOT_DIR, safePath);

  // If path is a directory, look for index.html inside it
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  // Fallback check in frontend/ if file not directly under root
  if (!fs.existsSync(filePath)) {
    const frontendCandidate = path.join(FRONTEND_DIR, safePath);
    if (fs.existsSync(frontendCandidate) && !fs.statSync(frontendCandidate).isDirectory()) {
      filePath = frontendCandidate;
    }
  }

  // Final check: if still not found, fallback to frontend/index.html for SPA hash routing
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const ext = path.extname(pathname);
    if (!ext) {
      filePath = path.join(FRONTEND_DIR, "index.html");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`404 Not Found: ${pathname}`);
      console.log(`[404] ${req.method} ${pathname}`);
      return;
    }
  }

  try {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Cache-Control": "no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
    console.log(`[200] ${req.method} ${pathname} (${contentType})`);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`500 Server Error: ${err.message}`);
    console.error(`[500] ${req.method} ${pathname}:`, err.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log("\n=======================================================");
  console.log(`🚀 ICPC Preparation Server Running`);
  console.log(`   Local URL:    http://localhost:${PORT}`);
  console.log(`   Frontend URL: http://localhost:${PORT}/frontend/`);
  console.log(`   Serving:      ${ROOT_DIR}`);
  console.log("=======================================================\n");
});

process.on("SIGINT", () => {
  console.log("\nServer shutting down...");
  server.close(() => process.exit(0));
});
