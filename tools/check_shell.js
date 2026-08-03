#!/usr/bin/env node
// Asserts that the shared shell (header and footer blocks) is byte-identical
// across every HTML page. The blocks are delimited by comment markers:
//   <!-- shell:header --> ... <!-- /shell:header -->
//   <!-- shell:footer --> ... <!-- /shell:footer -->

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

function extractBlock(source, name, file) {
  const open = `<!-- shell:${name} -->`;
  const close = `<!-- /shell:${name} -->`;
  const start = source.indexOf(open);
  const end = source.indexOf(close);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${file}: missing or malformed ${name} shell markers`);
  }
  return source.slice(start, end + close.length);
}

function firstDifference(a, b) {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : max;
}

const files = htmlFiles(ROOT).sort();
if (files.length === 0) {
  console.error("check_shell: no HTML files found");
  process.exit(1);
}

let failed = false;
const reference = {};
let referenceFile = null;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, "utf8");
  for (const block of ["header", "footer"]) {
    let extracted;
    try {
      extracted = extractBlock(source, block, rel);
    } catch (error) {
      console.error(`check_shell: ${error.message}`);
      failed = true;
      continue;
    }
    if (reference[block] === undefined) {
      reference[block] = extracted;
      referenceFile = rel;
    } else if (extracted !== reference[block]) {
      const at = firstDifference(reference[block], extracted);
      console.error(
        `check_shell: ${block} block in ${rel} differs from ${referenceFile} ` +
          `at byte ${at}:\n  expected ...${JSON.stringify(
            reference[block].slice(at, at + 40)
          )}\n  found    ...${JSON.stringify(extracted.slice(at, at + 40))}`
      );
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(`check_shell: OK (${files.length} pages share one shell)`);
