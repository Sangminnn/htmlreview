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

test("strips <object> / <embed> (iframe is allowed via sandbox — see Phase 2 tests)", () => {
  const out = sanitizeHtmlInput(
    `<p>a</p><object data="x"></object><embed src="x">`,
  );
  assert.match(out, /<p>a<\/p>/);
  assert.equal(out.includes("<object"), false);
  assert.equal(out.includes("<embed"), false);
});

test("preserves <mark> — used by our revision badges", () => {
  const out = sanitizeHtmlInput(`<p>see <mark>this</mark> change</p>`);
  assert.match(out, /<mark>this<\/mark>/);
});

// ── Phase 1 — static interactive ──

test("preserves <details> / <summary> + open attribute", () => {
  const out = sanitizeHtmlInput(
    `<details open><summary>title</summary><p>body</p></details>`,
  );
  assert.match(out, /<details[^>]*open[^>]*>/);
  assert.match(out, /<summary>title<\/summary>/);
  assert.match(out, /<p>body<\/p>/);
});

test("preserves <input type='checkbox|radio|range|text|number'>", () => {
  for (const type of ["checkbox", "radio", "range", "text", "number"]) {
    const out = sanitizeHtmlInput(`<input type="${type}">`);
    assert.match(out, new RegExp(`type="${type}"`), `${type} should pass`);
  }
});

test("strips <input type='file|password|submit|button|hidden|image'>", () => {
  for (const type of ["file", "password", "submit", "button", "hidden", "image"]) {
    const out = sanitizeHtmlInput(`<input type="${type}" name="x">`);
    assert.equal(out.includes("<input"), false, `${type} should be removed`);
  }
});

test("preserves <label for> + <input id>", () => {
  const out = sanitizeHtmlInput(
    `<label for="t1">탭1</label><input type="radio" id="t1" name="g">`,
  );
  assert.match(out, /<label for="t1">탭1<\/label>/);
  assert.match(out, /id="t1"/);
});

test("preserves inline <svg> with common shape children + attributes", () => {
  const svg = `<svg viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" fill="#dbeafe" stroke="#2563eb"/><circle cx="50" cy="50" r="20"/><text x="50" y="55" text-anchor="middle">A</text></svg>`;
  const out = sanitizeHtmlInput(svg);
  assert.match(out, /<svg viewBox="0 0 100 100">/);
  assert.match(out, /<rect[^>]*fill="#dbeafe"[^>]*\/?>/);
  assert.match(out, /<circle[^>]*cx="50"[^>]*\/?>/);
  assert.match(out, /<text[^>]*text-anchor="middle"[^>]*>A<\/text>/);
});

test("preserves <style> tag content", () => {
  const out = sanitizeHtmlInput(
    `<style>.x { background: #fef3c7; padding: 8px; }</style><div class="x">hi</div>`,
  );
  assert.match(out, /<style>/);
  assert.match(out, /background:\s*#fef3c7/);
  assert.match(out, /<div class="x">hi<\/div>/);
});

test("preserves safe inline style attribute on common elements", () => {
  const out = sanitizeHtmlInput(
    `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">cols</div>`,
  );
  assert.match(out, /style=/);
  assert.match(out, /display:grid/);
  assert.match(out, /grid-template-columns/);
});

test("strips position:fixed from inline style (anti-overlay)", () => {
  const out = sanitizeHtmlInput(
    `<div style="position: fixed; top: 0; left: 0; width: 100%">overlay</div>`,
  );
  assert.equal(out.includes("position:fixed"), false);
});

// ── Phase 2 — sandboxed iframe ──

test("iframe srcdoc passes through with sandbox forced", () => {
  const out = sanitizeHtmlInput(
    `<iframe srcdoc="<p>hi</p>" width="400" height="200"></iframe>`,
  );
  assert.match(out, /<iframe[^>]+sandbox=/);
  assert.match(out, /srcdoc=/);
});

test("iframe src is stripped — srcdoc only", () => {
  const out = sanitizeHtmlInput(
    `<iframe src="https://attacker.example.com"></iframe>`,
  );
  assert.equal(out.includes("attacker.example.com"), false);
  // iframe 자체는 통과하지만 src 가 사라짐
  assert.match(out, /<iframe[^>]*>/);
  assert.equal(out.includes("src="), false);
});

test("iframe sandbox=allow-same-origin is rejected (escalation blocked)", () => {
  const out = sanitizeHtmlInput(
    `<iframe srcdoc="<p>x</p>" sandbox="allow-scripts allow-same-origin"></iframe>`,
  );
  assert.match(out, /sandbox=/);
  assert.equal(out.includes("allow-same-origin"), false, "allow-same-origin must be stripped");
  assert.equal(out.includes("allow-top-navigation"), false);
});

test("iframe with no sandbox attr gets default sandbox=allow-scripts", () => {
  const out = sanitizeHtmlInput(`<iframe srcdoc="<p>x</p>"></iframe>`);
  assert.match(out, /sandbox="allow-scripts"/);
});
