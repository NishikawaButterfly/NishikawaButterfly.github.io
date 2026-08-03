#!/usr/bin/env node
// Regenerates the project cards on projects.html and the highlight cards
// on index.html from projects.json, the single source of truth for project
// facts. The generated markup lives between comment markers:
//   <!-- projects:start -->   ... <!-- projects:end -->    (projects.html)
//   <!-- highlights:start --> ... <!-- highlights:end -->  (index.html)
// tools/check_projects.js asserts the committed HTML matches a fresh
// regeneration byte for byte.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_FILE = path.join(ROOT, "projects.json");

const LINK_LABELS = [
  ["repo", () => "Repository"],
  ["release", (p) => `Release ${p.version}`],
  ["demo", () => "Live demo"],
  ["video", () => "Demo video"],
  ["case_study", () => "Case study"],
];

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pixel dimensions straight from the file, so the markup can carry
// width/height attributes without trusting a second data source.
function imageSize(file) {
  const data = fs.readFileSync(file);
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  if (data.length > 4 && data[0] === 0xff && data[1] === 0xd8) {
    let pos = 2;
    while (pos + 9 < data.length) {
      if (data[pos] !== 0xff) break;
      const marker = data[pos + 1];
      const isSOF =
        marker >= 0xc0 && marker <= 0xcf &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) {
        return {
          width: data.readUInt16BE(pos + 7),
          height: data.readUInt16BE(pos + 5),
        };
      }
      pos += 2 + data.readUInt16BE(pos + 2);
    }
  }
  throw new Error(`cannot read image dimensions of ${file}`);
}

function linkRow(project) {
  const parts = [];
  for (const [key, label] of LINK_LABELS) {
    const url = project.links[key];
    if (url) {
      parts.push(`<a href="${escapeHtml(url)}">${escapeHtml(label(project))}</a>`);
    }
  }
  return parts.join(" · ");
}

function mediaBlock(project, indent) {
  if (project.image === null) {
    return [
      `${indent}<div class="card-media card-media-text" aria-hidden="true">`,
      `${indent}  <span class="card-slug">${escapeHtml(project.slug)}</span>`,
      `${indent}</div>`,
    ].join("\n");
  }
  const file = path.join(ROOT, project.image.replace(/^\//, ""));
  const { width, height } = imageSize(file);
  const contain = height > width ? " contain" : "";
  return [
    `${indent}<div class="card-media${contain}">`,
    `${indent}  <img src="${escapeHtml(project.image)}" alt="${escapeHtml(project.image_alt)}" width="${width}" height="${height}" loading="lazy">`,
    `${indent}</div>`,
  ].join("\n");
}

function renderProjectsBlock(data) {
  const cards = data.projects.map((p) => {
    const b = "          "; // card-body children
    return [
      `        <article class="project-card" id="${escapeHtml(p.slug)}">`,
      mediaBlock(p, b),
      `${b}<div class="card-body">`,
      `${b}  <h2>${escapeHtml(p.name)}</h2>`,
      `${b}  <p class="card-meta">${escapeHtml(p.status)} · ${escapeHtml(p.version)}</p>`,
      `${b}  <p>${escapeHtml(p.description)}</p>`,
      `${b}  <p class="card-result"><strong>Result:</strong> ${escapeHtml(p.result)}</p>`,
      `${b}  <p class="card-limit">Limitation: ${escapeHtml(p.limitation)}</p>`,
      `${b}  <p class="tech">${p.tech.map(escapeHtml).join(" · ")}</p>`,
      `${b}  <p class="links">${linkRow(p)}</p>`,
      `${b}</div>`,
      `        </article>`,
    ].join("\n");
  });
  return [
    "      <div class=\"project-grid\">",
    cards.join("\n"),
    "      </div>",
  ].join("\n");
}

// "The interesting bit: the same inputs ..." — drop the capital when the
// sentence starts with an ordinary word, keep it for acronyms and names.
function asHook(sentence) {
  return /^[A-Z][a-z]/.test(sentence)
    ? sentence[0].toLowerCase() + sentence.slice(1)
    : sentence;
}

function renderHighlightsBlock(data) {
  const bySlug = new Map(data.projects.map((p) => [p.slug, p]));
  const cards = data.home_highlights.map((slug) => {
    const p = bySlug.get(slug);
    if (!p) throw new Error(`home highlight "${slug}" is not in projects`);
    const links = [];
    if (p.links.demo) {
      links.push(`<a href="${escapeHtml(p.links.demo)}">Live demo</a>`);
    }
    links.push(`<a href="${escapeHtml(p.links.repo)}">Repository</a>`);
    return [
      `        <article class="card">`,
      `          <h3>${escapeHtml(p.name)}</h3>`,
      `          <p class="card-meta">${escapeHtml(p.status)} · ${escapeHtml(p.version)}</p>`,
      `          <p>${escapeHtml(p.description)}</p>`,
      `          <p class="hook">The interesting bit: ${escapeHtml(asHook(p.result))}</p>`,
      `          <p class="links">${links.join(" · ")}</p>`,
      `        </article>`,
    ].join("\n");
  });
  return cards.join("\n");
}

function replaceBetween(source, startMarker, endMarker, replacement, file) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${file}: missing or malformed ${startMarker} markers`);
  }
  // Keep the end marker's own indentation, whatever the page uses.
  let indentStart = end;
  while (indentStart > 0 && source[indentStart - 1] === " ") {
    indentStart -= 1;
  }
  return (
    source.slice(0, start + startMarker.length) +
    "\n" + replacement + "\n" +
    source.slice(indentStart)
  );
}

const TARGETS = [
  {
    file: "projects.html",
    start: "<!-- projects:start -->",
    end: "<!-- projects:end -->",
    render: renderProjectsBlock,
  },
  {
    file: "index.html",
    start: "<!-- highlights:start -->",
    end: "<!-- highlights:end -->",
    render: renderHighlightsBlock,
  },
];

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function main() {
  const data = loadData();
  for (const target of TARGETS) {
    const file = path.join(ROOT, target.file);
    const source = fs.readFileSync(file, "utf8");
    const updated = replaceBetween(
      source, target.start, target.end, target.render(data), target.file
    );
    if (updated !== source) {
      fs.writeFileSync(file, updated);
      console.log(`build_projects: wrote ${target.file}`);
    } else {
      console.log(`build_projects: ${target.file} already current`);
    }
  }
}

module.exports = { TARGETS, loadData, replaceBetween };

if (require.main === module) {
  main();
}
