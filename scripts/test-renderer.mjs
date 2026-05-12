// M2 단위 테스트 — renderer.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdownToHtml } from "../src/renderer.mjs";

test("renders headings with stable id slugs", () => {
  const html = renderMarkdownToHtml("# Hello World\n\n## Sub Section\n");
  assert.match(html, /<h1 id="hello-world">Hello World<\/h1>/);
  assert.match(html, /<h2 id="sub-section">Sub Section<\/h2>/);
});

test("duplicate heading text disambiguated by numeric suffix", () => {
  const html = renderMarkdownToHtml("# Notes\n\nfoo\n\n# Notes\n\nbar\n");
  assert.match(html, /<h1 id="notes">Notes<\/h1>/);
  assert.match(html, /<h1 id="notes-2">Notes<\/h1>/);
});

test("Korean headings produce a non-empty unicode slug", () => {
  const html = renderMarkdownToHtml("# 한국어 제목\n\n본문\n");
  const match = html.match(/<h1 id="([^"]+)">한국어 제목<\/h1>/);
  assert.ok(match, "heading must carry an id");
  assert.equal(match[1], "한국어-제목");
});

test("renders list / code as semantic HTML", () => {
  const md = "## Items\n\n- alpha\n- beta\n\n## Code\n\n```js\nconst x = 1;\n```\n";
  const html = renderMarkdownToHtml(md);
  assert.match(html, /<ul>/);
  assert.match(html, /<li>alpha<\/li>/);
  assert.match(html, /<pre><code class="language-js">/);
});

test("does NOT inject data-block-id or data-anchor (v1 residue)", () => {
  const html = renderMarkdownToHtml("# Heading\n\n- item 1\n- item 2\n");
  assert.doesNotMatch(html, /data-block-id/);
  assert.doesNotMatch(html, /data-anchor/);
});

test("heading inline formatting is preserved in output but stripped from slug", () => {
  const html = renderMarkdownToHtml("# Hello **bold** world\n");
  // inline emphasis tag inside heading
  assert.match(html, /<strong>bold<\/strong>/);
  // slug uses plain text
  assert.match(html, /<h1 id="hello-bold-world">/);
});

test("empty fixture renders empty string (not crash)", () => {
  const html = renderMarkdownToHtml("");
  assert.equal(typeof html, "string");
});
