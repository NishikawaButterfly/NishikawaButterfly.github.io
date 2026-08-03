#!/usr/bin/env node
// Checks every href and src in the site's HTML files.
// Internal references must resolve to a file in the repository.
// External references must use https. Same-page fragments must match an id.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules"]);

function htmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        out.push(...htmlFiles(path.join(dir, entry.name)));
      }
    } else if (entry.name.endsWith(".html")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function references(source) {
  const out = [];
  const pattern = /\b(?:href|src)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    out.push(match[1]);
  }
  return out;
}

function idExists(source, id) {
  return source.includes(`id="${id}"`);
}

function resolveInternal(url, file) {
  const clean = url.split("#")[0].split("?")[0];
  let target;
  if (clean.startsWith("/")) {
    target = path.join(ROOT, clean.slice(1));
  } else {
    target = path.resolve(path.dirname(file), clean);
  }
  if (clean.endsWith("/") || clean === "") {
    target = path.join(target, "index.html");
  }
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    target = path.join(target, "index.html");
  }
  return target;
}

const files = htmlFiles(ROOT).sort();
if (files.length === 0) {
  console.error("check_links: no HTML files found");
  process.exit(1);
}

const problems = [];
let checked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, "utf8");
  for (const url of references(source)) {
    checked += 1;
    if (url === "") {
      problems.push(`${rel}: empty href/src`);
    } else if (url.startsWith("mailto:")) {
      // Fine as-is.
    } else if (url.startsWith("#")) {
      if (!idExists(source, url.slice(1))) {
        problems.push(`${rel}: fragment ${url} matches no id on the page`);
      }
    } else if (url.startsWith("https://")) {
      // External links must simply be https; reachability is not CI's job.
    } else if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//")) {
      problems.push(`${rel}: non-https reference "${url}"`);
    } else {
      const target = resolveInternal(url, file);
      if (!fs.existsSync(target)) {
        problems.push(
          `${rel}: "${url}" does not resolve (looked for ${path.relative(ROOT, target)})`
        );
      }
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`check_links: ${problem}`);
  }
  process.exit(1);
}
console.log(`check_links: OK (${checked} references across ${files.length} pages)`);
