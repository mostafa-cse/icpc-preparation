#!/usr/bin/env node
/*
 * Stamps ?v=<content-hash> onto every local asset in index.html.
 *
 * GitHub Pages serves assets with cache-control: max-age=600, so for ten
 * minutes after a deploy a browser can be running the new script.js against
 * the old styles.css. That combination is worse than being fully stale: a
 * feature ships half-applied and looks broken rather than absent.
 *
 * A hash in the query string makes each version a distinct URL, so the browser
 * fetches it the moment index.html changes. Unchanged files keep their hash and
 * stay cached.
 *
 *   node stamp.js          rewrite index.html
 *   node stamp.js --check  exit 1 if a stamp is stale (no writes)
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..", "frontend");
const PAGE = path.join(ROOT, "index.html");
const check = process.argv.indexOf("--check") !== -1;

const hash = file =>
  crypto.createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 8);

let html = fs.readFileSync(PAGE, "utf8");
const stale = [];

// src="foo.js" / href="foo.css", with or without an existing ?v=
html = html.replace(/\b(src|href)="([A-Za-z0-9._-]+\.(?:js|css))(\?v=[a-f0-9]+)?"/g,
  (whole, attr, file, had) => {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) return whole;          // leave CDN and missing files alone
    const want = "?v=" + hash(abs);
    if (had !== want) stale.push(file);
    return attr + '="' + file + want + '"';
  });

if (check) {
  if (stale.length) {
    console.error("stale asset stamps: " + stale.join(", "));
    process.exit(1);
  }
  console.log("all asset stamps current");
  process.exit(0);
}

fs.writeFileSync(PAGE, html);
console.log(stale.length ? "restamped: " + stale.join(", ") : "no changes needed");
