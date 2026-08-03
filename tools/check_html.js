#!/usr/bin/env node
// A light HTML well-formedness check, dependency-free by design.
// Verifies, for every page: a doctype, a lang attribute, a non-empty title,
// balanced and properly nested tags, exactly one main landmark and one h1,
// alt attributes on images, and unique ids.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SKIP_DIRS = new Set([".git", "node_modules"]);

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);
const RAW_TEXT = new Set(["script", "style"]);

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

// Scan one tag starting at "<", honoring quoted attribute values.
function readTag(source, start) {
  let i = start + 1;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      return { raw: source.slice(start, i + 1), end: i + 1 };
    }
    i += 1;
  }
  return null;
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function checkFile(file) {
  const rel = path.relative(ROOT, file);
  const source = fs.readFileSync(file, "utf8");
  const errors = [];

  if (!/^<!doctype html>/i.test(source.trimStart())) {
    errors.push("missing <!doctype html>");
  }

  const stack = [];
  const ids = new Map();
  let mains = 0;
  let h1s = 0;
  let title = null;
  let i = 0;

  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt === -1) break;

    if (source.startsWith("<!--", lt)) {
      const close = source.indexOf("-->", lt);
      if (close === -1) {
        errors.push(`line ${lineOf(source, lt)}: unterminated comment`);
        break;
      }
      i = close + 3;
      continue;
    }

    if (source.startsWith("<!", lt)) {
      i = source.indexOf(">", lt);
      if (i === -1) break;
      i += 1;
      continue;
    }

    const tag = readTag(source, lt);
    if (tag === null) {
      errors.push(`line ${lineOf(source, lt)}: unterminated tag`);
      break;
    }
    i = tag.end;

    const nameMatch = tag.raw.match(/^<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/);
    if (!nameMatch) {
      errors.push(`line ${lineOf(source, lt)}: unparseable tag ${tag.raw.slice(0, 30)}`);
      continue;
    }
    const name = nameMatch[1].toLowerCase();
    const closing = tag.raw.startsWith("</");
    const selfClosing = /\/>$/.test(tag.raw);

    if (closing) {
      if (stack.length === 0 || stack[stack.length - 1].name !== name) {
        const open = stack.length ? stack[stack.length - 1].name : "nothing";
        errors.push(
          `line ${lineOf(source, lt)}: </${name}> closes nothing (open: ${open})`
        );
      } else {
        stack.pop();
      }
      continue;
    }

    // Attribute checks on opening tags.
    if (name === "html" && !/\slang\s*=\s*"[^"]+"/.test(tag.raw)) {
      errors.push("html element has no lang attribute");
    }
    if (name === "img" && !/\salt\s*=/.test(tag.raw)) {
      errors.push(`line ${lineOf(source, lt)}: img without alt`);
    }
    if (name === "main") mains += 1;
    if (name === "h1") h1s += 1;

    const idMatch = tag.raw.match(/\sid\s*=\s*"([^"]*)"/);
    if (idMatch) {
      if (ids.has(idMatch[1])) {
        errors.push(
          `line ${lineOf(source, lt)}: duplicate id "${idMatch[1]}" ` +
            `(first on line ${ids.get(idMatch[1])})`
        );
      } else {
        ids.set(idMatch[1], lineOf(source, lt));
      }
    }

    if (VOID.has(name) || selfClosing) continue;

    if (RAW_TEXT.has(name)) {
      const closeTag = `</${name}`;
      const close = source.toLowerCase().indexOf(closeTag, i);
      if (close === -1) {
        errors.push(`line ${lineOf(source, lt)}: unterminated <${name}>`);
        break;
      }
      i = source.indexOf(">", close) + 1;
      continue;
    }

    if (name === "title") {
      const close = source.indexOf("</title>", i);
      if (close === -1) {
        errors.push("unterminated <title>");
        break;
      }
      title = source.slice(i, close).trim();
      i = close + "</title>".length;
      continue;
    }

    stack.push({ name, line: lineOf(source, lt) });
  }

  for (const open of stack) {
    errors.push(`line ${open.line}: <${open.name}> is never closed`);
  }
  if (title === null || title === "") {
    errors.push("missing or empty <title>");
  }
  if (mains !== 1) {
    errors.push(`expected exactly one <main>, found ${mains}`);
  }
  if (h1s !== 1) {
    errors.push(`expected exactly one <h1>, found ${h1s}`);
  }

  return errors.map((message) => `${rel}: ${message}`);
}

const files = htmlFiles(ROOT).sort();
if (files.length === 0) {
  console.error("check_html: no HTML files found");
  process.exit(1);
}

const problems = files.flatMap(checkFile);
if (problems.length > 0) {
  for (const problem of problems) {
    console.error(`check_html: ${problem}`);
  }
  process.exit(1);
}
console.log(`check_html: OK (${files.length} pages well-formed)`);
