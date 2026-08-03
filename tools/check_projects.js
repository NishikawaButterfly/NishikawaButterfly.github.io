#!/usr/bin/env node
// Asserts that the committed project cards are exactly what
// tools/build_projects.js would generate from projects.json — a fresh
// regeneration of projects.html and index.html must be byte-identical
// to the files in the repository. Also sanity-checks projects.json:
// required fields, unique slugs, existing image files, and alt text
// wherever there is an image.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const { TARGETS, loadData, replaceBetween } = require("./build_projects.js");

const REQUIRED = [
  "slug", "name", "status", "version", "description",
  "result", "limitation", "tech", "links",
];

let failed = false;

function fail(message) {
  console.error(`check_projects: ${message}`);
  failed = true;
}

const data = loadData();

const slugs = new Set();
for (const p of data.projects) {
  const label = p.slug || p.name || "(unnamed project)";
  for (const field of REQUIRED) {
    if (p[field] === undefined || p[field] === null || p[field] === "") {
      fail(`${label}: missing required field "${field}"`);
    }
  }
  if (slugs.has(p.slug)) {
    fail(`duplicate slug "${p.slug}"`);
  }
  slugs.add(p.slug);
  if (p.links && !p.links.repo) {
    fail(`${label}: links.repo is required`);
  }
  if (!/^v\d+\.\d+\.\d+$/.test(p.version || "")) {
    fail(`${label}: version "${p.version}" is not of the form vX.Y.Z`);
  }
  if (p.image !== null) {
    const file = path.join(ROOT, String(p.image).replace(/^\//, ""));
    if (!fs.existsSync(file)) {
      fail(`${label}: image "${p.image}" does not exist`);
    }
    if (!p.image_alt) {
      fail(`${label}: image without image_alt`);
    }
  }
}

function firstDifference(a, b) {
  const max = Math.min(a.length, b.length);
  for (let i = 0; i < max; i += 1) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : max;
}

for (const target of TARGETS) {
  const file = path.join(ROOT, target.file);
  const committed = fs.readFileSync(file, "utf8");
  let regenerated;
  try {
    regenerated = replaceBetween(
      committed, target.start, target.end, target.render(data), target.file
    );
  } catch (error) {
    fail(error.message);
    continue;
  }
  if (regenerated !== committed) {
    const at = firstDifference(committed, regenerated);
    fail(
      `${target.file} is stale at byte ${at}:\n` +
        `  committed   ...${JSON.stringify(committed.slice(at, at + 40))}\n` +
        `  regenerated ...${JSON.stringify(regenerated.slice(at, at + 40))}\n` +
        `  run: node tools/build_projects.js`
    );
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  `check_projects: OK (${data.projects.length} cards and ` +
    `${data.home_highlights.length} highlights regenerate byte-identically)`
);
