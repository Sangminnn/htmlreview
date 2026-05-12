# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-05-12

Initial release. Founding design captured in [`docs/design.md`](docs/design.md).

### Added

- **Selector model** (`src/selector.mjs`) — DOM Range ↔ W3C `TextQuoteSelector`, built on Hypothesis [`dom-anchor-text-quote`](https://github.com/hypothesis/dom-anchor-text-quote) (with `diff-match-patch` fuzzy fallback).
- **Annotation envelope builder** (`src/annotation.mjs`) — emits valid W3C `Annotation` objects with `urn:htmlreview:annotation:<uuid-v4>` identifiers and content-addressed `urn:htmlreview:doc:<sha256-16>` source URNs.
- **Renderer** (`src/renderer.mjs`) — markdown → semantic HTML; auto-generates stable heading `id` slugs (incl. Korean unicode); no `data-block-id` residue.
- **Sanitizer** (`src/sanitize.mjs`) — HTML input passes through `sanitize-html`; preserves semantic tags + heading `id`s; strips `<script>` / inline event handlers / `<iframe>` / `<object>` / `<embed>` / `javascript:` and `data:` URL schemes.
- **HTTP server** (`src/server.mjs`) — serves review page + bundle + sourcemap; receives `POST /submit` raw items and emits a `AnnotationCollection` to stdout when resolved; safe auto-close of macOS browser tabs.
- **CLI** (`bin/htmlreview.mjs`) — flags: `--title --port --no-open --input-format md|html --revision-report --timeout`; markdown or HTML input via file or stdin.
- **Web client** (`web/`) — selector-based comment UI; text-selection toolbar; comment bubble with delete; `<mark>` highlight via `range.surroundContents`; revision-report left sidebar with "변경됨" badges that bi-directionally jump between body and sidebar card. Bundled by esbuild (87.8 kB).
- **Tests** — 24 unit tests (selector / renderer / sanitize) using `node:test` + `jsdom`; end-to-end smoke test that exercises stdin → render → page → submit → stdout `AnnotationCollection`.

### Origin

Reframe of [mdreview](https://github.com/sangminnn/mdreview) v1.x. The on-the-wire schema is now valid [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/), so annotations are interoperable with any standards-conformant tool. The `block` / `range` dual model is gone; everything is a single `Selector`.

[1.0.0]: https://github.com/sangminnn/htmlreview/releases/tag/v1.0.0
