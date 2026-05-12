// M1 단위 테스트 — selector.mjs + annotation.mjs
//
// node:test 빌트인 사용 (Node 18+). jsdom 으로 DOM Range 시뮬레이션.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

import { createSelector, resolveSelector } from "../src/selector.mjs";
import { buildAnnotation, computeSourceUrn } from "../src/annotation.mjs";

const setup = (html) => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="root">${html}</div></body></html>`);
  const { window } = dom;
  // dom-anchor-* 가 글로벌 Node / Range / NodeFilter 등을 참조하므로 설치
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.Node = window.Node;
  globalThis.Range = window.Range;
  globalThis.Element = window.Element;
  globalThis.NodeFilter = window.NodeFilter;
  const root = window.document.getElementById("root");
  return { dom, root, doc: window.document };
};

test("createSelector → resolveSelector roundtrip on single text node", () => {
  const { doc, root } = setup(`<p>The quick brown fox jumps over the lazy dog.</p>`);
  const textNode = root.querySelector("p").firstChild;
  const range = doc.createRange();
  range.setStart(textNode, 10); // "brown"
  range.setEnd(textNode, 15);

  const selector = createSelector(root, range);
  assert.equal(selector.type, "TextQuoteSelector");
  assert.equal(selector.exact, "brown");

  const resolved = resolveSelector(root, selector);
  assert.ok(resolved, "selector should resolve");
  assert.equal(resolved.toString(), "brown");
});

test("duplicate exact text — prefix/suffix disambiguate two occurrences", () => {
  // 32자 context 가 unique 해질 만큼 긴 현실적 문장 사용.
  // 짧은 문장에선 prefix/suffix 가 텍스트 전체를 덮어 disambiguation 한계
  // → schema §4.2 의 fallback chain (FragmentSelector / RangeSelector) 으로 보완 (M2+).
  const { doc, root } = setup(
    `<p>In our refactor plan, JwtVerifier handles tokens for the auth gateway. Later, we will rename JwtVerifier to TokenVerifier across the codebase.</p>`,
  );
  const textNode = root.querySelector("p").firstChild;
  const text = textNode.data;
  const needle = "JwtVerifier";
  const first = text.indexOf(needle);
  const second = text.indexOf(needle, first + 1);
  assert.ok(first >= 0 && second > first, "fixture must contain needle twice");

  const range1 = doc.createRange();
  range1.setStart(textNode, first);
  range1.setEnd(textNode, first + needle.length);

  const range2 = doc.createRange();
  range2.setStart(textNode, second);
  range2.setEnd(textNode, second + needle.length);

  const sel1 = createSelector(root, range1);
  const sel2 = createSelector(root, range2);

  assert.equal(sel1.exact, needle);
  assert.equal(sel2.exact, needle);
  assert.notEqual(sel1.prefix, sel2.prefix, "prefixes should differ");

  const r1 = resolveSelector(root, sel1);
  const r2 = resolveSelector(root, sel2);
  assert.ok(r1 && r2, "both selectors must resolve");
  assert.notEqual(r1.startOffset, r2.startOffset, "occurrences must resolve to distinct offsets");
  assert.equal(r1.startOffset, first, "sel1 → first occurrence");
  assert.equal(r2.startOffset, second, "sel2 → second occurrence");
});

test("createSelector crossing multiple block nodes", () => {
  const { doc, root } = setup(`<p>First paragraph.</p><p>Second paragraph.</p>`);
  const firstP = root.querySelectorAll("p")[0].firstChild;
  const secondP = root.querySelectorAll("p")[1].firstChild;

  const range = doc.createRange();
  range.setStart(firstP, 6); // "paragraph.\nSecond"
  range.setEnd(secondP, 6);

  const selector = createSelector(root, range);
  assert.ok(selector);
  assert.equal(selector.type, "TextQuoteSelector");
  // exact 가 두 문단을 가로지름
  assert.match(selector.exact, /paragraph/);

  const resolved = resolveSelector(root, selector);
  assert.ok(resolved, "cross-node range should resolve");
});

test("resolveSelector returns null when exact text is missing", () => {
  const { doc, root } = setup(`<p>The quick brown fox.</p>`);
  const textNode = root.querySelector("p").firstChild;
  const range = doc.createRange();
  range.setStart(textNode, 10);
  range.setEnd(textNode, 15); // "brown"

  const selector = createSelector(root, range);

  const { root: rootB } = setup(`<p>The quick red fox.</p>`);
  const resolved = resolveSelector(rootB, selector);
  assert.equal(resolved, null, "text gone — should return null");
});

test("collapsed range yields null selector", () => {
  const { doc, root } = setup(`<p>hello world</p>`);
  const range = doc.createRange();
  const textNode = root.querySelector("p").firstChild;
  range.setStart(textNode, 3);
  range.setEnd(textNode, 3);
  assert.equal(createSelector(root, range), null);
});

test("buildAnnotation produces W3C Annotation envelope", () => {
  const selector = {
    type: "TextQuoteSelector",
    exact: "brown",
    prefix: "The quick ",
    suffix: " fox",
  };
  const sourceUrn = computeSourceUrn("The quick brown fox jumps over the lazy dog.");
  const ann = buildAnnotation({
    selector,
    commentText: "왜 갈색?",
    sourceUrn,
    format: "text/html",
  });

  assert.equal(ann["@context"], "http://www.w3.org/ns/anno.jsonld");
  assert.equal(ann.type, "Annotation");
  assert.equal(ann.motivation, "commenting");
  assert.match(ann.id, /^urn:htmlreview:annotation:[0-9a-f-]{36}$/);
  assert.equal(ann.target.source, sourceUrn);
  assert.equal(ann.target.format, "text/html");
  assert.deepEqual(ann.target.selector, selector);
  assert.equal(ann.body.length, 1);
  assert.equal(ann.body[0].type, "TextualBody");
  assert.equal(ann.body[0].value, "왜 갈색?");
  assert.equal(ann.body[0].purpose, "commenting");
});

test("buildAnnotation includes Image bodies for attached images", () => {
  const ann = buildAnnotation({
    selector: { type: "TextQuoteSelector", exact: "x" },
    commentText: "look",
    images: [
      "data:image/png;base64,iVBORw0KGgo=",
      "data:image/webp;base64,UklGRg==",
    ],
    sourceUrn: "urn:htmlreview:doc:abcdef0123456789",
    format: "text/markdown",
  });
  assert.equal(ann.body.length, 3);
  assert.equal(ann.body[1].type, "Image");
  assert.equal(ann.body[1].format, "image/png");
  assert.equal(ann.body[2].format, "image/webp");
});

test("buildAnnotation omits TextualBody when commentText is empty", () => {
  const ann = buildAnnotation({
    selector: { type: "TextQuoteSelector", exact: "x" },
    commentText: "",
    images: ["data:image/png;base64,iVBORw0KGgo="],
    sourceUrn: "urn:htmlreview:doc:abcdef0123456789",
    format: "text/markdown",
  });
  assert.equal(ann.body.length, 1);
  assert.equal(ann.body[0].type, "Image");
});

test("buildAnnotation throws without selector or sourceUrn", () => {
  assert.throws(() => buildAnnotation({ sourceUrn: "x" }), /selector/);
  assert.throws(() => buildAnnotation({ selector: { type: "TextQuoteSelector", exact: "x" } }), /sourceUrn/);
});

test("computeSourceUrn is deterministic and content-addressed", () => {
  const a = computeSourceUrn("hello");
  const b = computeSourceUrn("hello");
  const c = computeSourceUrn("world");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^urn:htmlreview:doc:[0-9a-f]{16}$/);
});
