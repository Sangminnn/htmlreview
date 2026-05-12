// M6 단위 테스트 — sanitize.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeHtmlInput } from "../src/sanitize.mjs";

test("strips <script> tags", () => {
  const out = sanitizeHtmlInput(`<p>safe</p><script>alert(1)</script>`);
  assert.equal(out.includes("<script"), false);
  assert.match(out, /<p>safe<\/p>/);
});

test("strips inline event handlers (onclick etc.)", () => {
  const out = sanitizeHtmlInput(`<p onclick="alert(1)">hi</p>`);
  assert.match(out, /<p>hi<\/p>/);
  assert.equal(out.includes("onclick"), false);
});

test("preserves common semantic tags", () => {
  const html =
    `<h1 id="x">Hi</h1><p>body</p><ul><li>a</li></ul>` +
    `<table><tr><td>c</td></tr></table>` +
    `<pre><code>const x = 1;</code></pre>` +
    `<blockquote>q</blockquote>`;
  const out = sanitizeHtmlInput(html);
  assert.match(out, /<h1 id="x">Hi<\/h1>/);
  assert.match(out, /<p>body<\/p>/);
  assert.match(out, /<ul><li>a<\/li><\/ul>/);
  assert.match(out, /<table>/);
  assert.match(out, /<pre><code>const x = 1;<\/code><\/pre>/);
  assert.match(out, /<blockquote>q<\/blockquote>/);
});

test("preserves heading id attribute — FragmentSelector target", () => {
  const out = sanitizeHtmlInput(`<h2 id="impl-plan">Section</h2>`);
  assert.match(out, /id="impl-plan"/);
});

test("allows a[href] with http / https / mailto only", () => {
  assert.match(sanitizeHtmlInput(`<a href="https://example.com">x</a>`), /href="https:\/\/example.com"/);
  assert.match(sanitizeHtmlInput(`<a href="http://example.com">x</a>`), /href="http:\/\/example.com"/);
  assert.match(sanitizeHtmlInput(`<a href="mailto:x@y.z">x</a>`), /href="mailto:x@y.z"/);

  const dangerous = sanitizeHtmlInput(`<a href="javascript:alert(1)">x</a>`);
  assert.equal(dangerous.includes("javascript:"), false);

  const dataUrl = sanitizeHtmlInput(`<a href="data:text/html,<script>1</script>">x</a>`);
  assert.equal(dataUrl.includes("data:"), false);
});

test("strips <iframe> / <object> / <embed>", () => {
  const out = sanitizeHtmlInput(
    `<p>a</p><iframe src="x"></iframe><object data="x"></object><embed src="x">`,
  );
  assert.match(out, /<p>a<\/p>/);
  assert.equal(out.includes("<iframe"), false);
  assert.equal(out.includes("<object"), false);
  assert.equal(out.includes("<embed"), false);
});

test("preserves <mark> — used by our revision badges", () => {
  const out = sanitizeHtmlInput(`<p>see <mark>this</mark> change</p>`);
  assert.match(out, /<mark>this<\/mark>/);
});
