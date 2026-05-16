# htmlreview

[English](README.md) · [한국어](README.ko.md)

> Local web review gate for markdown and HTML documents.
> A Claude Code skill for human-in-the-loop planning, built on the
> [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/).

Open a plan in the browser, let the reviewer highlight any text and attach a
comment (optionally with images), and pull back a **W3C `AnnotationCollection`
JSON** when they click *진행*. The result is interoperable with any standards-
conformant annotation tool — no bespoke JSON shape.

## Screenshots

![Main view](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/main.png)

| Comment bubble | Revision sidebar |
|---|---|
| ![Comment bubble](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/bubble.png) | ![Revision sidebar](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/revision.png) |

## Install

```bash
npm install -g htmlreview
```

Node ≥ 18 required.

## CLI

```bash
htmlreview plan.md
htmlreview plan.md --title "Refactor plan" --timeout 600
cat plan.md | htmlreview --input-format md

# HTML input (sanitized by sanitize-html)
htmlreview design.html

# Multi-round — show previous round's comments + your resolutions in sidebar
htmlreview revised.md --revision-report round-1.json
```

| Option | Default | Notes |
|---|---|---|
| `--title <text>` | `Review` | Browser tab title + topbar header |
| `--port <n>` | random ephemeral | HTTP port |
| `--no-open` | — | Don't auto-open browser |
| `--input-format <md\|html>` | inferred from ext (`.md`/`.html`) | Force input format |
| `--revision-report <file>` | — | Previous round `AnnotationCollection` JSON |
| `--timeout <seconds>` | — | Auto-fail if no submit within N seconds |
| `-v / --version` | — | Print version |
| `-h / --help` | — | Print help |

## Output schema

A W3C-conformant `AnnotationCollection` (see [`docs/design.md`](docs/design.md) §6.1):

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "AnnotationCollection",
  "status": "approved" | "revision_requested",
  "target": {
    "source": "urn:htmlreview:doc:<sha256-16>",
    "format": "text/markdown"
  },
  "items": [
    {
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "type": "Annotation",
      "id": "urn:htmlreview:annotation:<uuid-v4>",
      "motivation": "commenting",
      "body": [
        { "type": "TextualBody", "value": "...", "purpose": "commenting" }
      ],
      "target": {
        "source": "<same source URN>",
        "format": "text/markdown",
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "the selected text",
          "prefix": "32 chars of context before",
          "suffix": "32 chars of context after"
        }
      }
    }
  ]
}
```

- `status` is the only htmlreview-specific extension; everything else is
  vanilla W3C Web Annotation.
- Image attachments appear as additional `body[]` entries with `type: "Image"`
  and a `data:` URL value.

See [`example.md`](example.md) for a full shell + `jq` example,
[`SKILL.md`](SKILL.md) for the Claude Code skill manifest,
and [`reviewer.md`](reviewer.md) for the multi-round workflow.

## Supported content

Markdown is rendered via [marked](https://github.com/markedjs/marked); HTML input goes through [sanitize-html](https://github.com/apostrophecms/sanitize-html). What you can use:

- Standard markdown — headings (h1–h6 with auto id slugs incl. Korean), lists (nested + GFM task list), tables, blockquote, code blocks, inline emphasis, links (http/https/mailto), images.
- Static interactive HTML — `<details>` / `<summary>`, inline `<svg>` diagrams (rect, line, path, marker, etc.), CSS-only tabs (`<input type="radio">` + `<label>` + `:checked`), `<style>` blocks, safe inline `style` attributes.
- **Sandboxed JS regions** — `<iframe sandbox="allow-scripts" srcdoc="...">` for slider / drag-drop / live re-render / chart demos. `allow-same-origin` and `allow-top-navigation` are stripped; `src` is removed (only `srcdoc` allowed).

See [`docs/showcase.md`](docs/showcase.md) for a single-page tour of every supported element.

## Architecture

```
bin/htmlreview.mjs   CLI: argparse, file or stdin input, --revision-report loader
src/server.mjs       HTTP server: page build, /submit → AnnotationCollection
src/renderer.mjs     markdown → semantic HTML + heading id slugs + figure wrap
src/sanitize.mjs     HTML input sanitization (sanitize-html)
src/selector.mjs     DOM Range ↔ W3C TextQuoteSelector (dom-anchor-text-quote)
src/annotation.mjs   W3C Annotation envelope builder + URN computation
web/src/app.mjs      Client: selection toolbar, comment bubble, highlight, revision sidebar
web/index.html       Page template — __TITLE__ / __CONTENT__ / __REVISION_REPORT_JSON__
web/style.css        Stylesheet
web/app.bundle.js    esbuild output (~106 kB, gitignored, included in npm publish)
```

## Selector resilience

Annotations stay anchored as long as the `exact` text is present and the
32-char `prefix` / `suffix` disambiguate it. When the document text changes
substantially, a `diff-match-patch` fuzzy fallback takes over. If a selector
cannot resolve at all, the annotation is **still in the output JSON** — only
the in-body highlight is suppressed. See `reviewer.md` §4.

## Develop

```bash
git clone https://github.com/Sangminnn/htmlreview.git
cd htmlreview
npm install
npm run build:client    # esbuild bundles web/src/app.mjs → web/app.bundle.js
npm test                # 36 unit tests (node:test + jsdom)
npm run smoke           # end-to-end: stdin → render → page → submit → stdout
npm run capture         # Playwright captures 3 screenshots → docs/screenshots/
```

## Inspired by

- [**mdreview**](https://github.com/sangminnn/mdreview) — the markdown-only predecessor. htmlreview replaces its `block` / `range` dual model with a single `Selector` and extends input to HTML.
- [**W3C Web Annotation Data Model**](https://www.w3.org/TR/annotation-model/) — the schema this project speaks natively. No bespoke JSON shape; the result is federation-ready.
- [**Hypothesis `dom-anchor-text-quote`**](https://github.com/hypothesis/dom-anchor-text-quote) — production-tested DOM Range ↔ TextQuoteSelector anchoring with `diff-match-patch` fuzzy matching.
- [**Thariq's "HTML Effectiveness"**](https://thariqs.github.io/html-effectiveness/) — the argument that agents producing self-contained HTML artifacts (with spatial layout, live render, collapsibles, throwaway interactions) get *read* rather than *skimmed*. htmlreview is the reviewer's gate for those artifacts.

## License

MIT
