# htmlreview

Local web review for markdown and HTML documents.
A Claude Code skill for human-in-the-loop planning, built on the
[W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/).

> **Status:** pre-release (v0.1.0 — under active development).
> Founding design: [`docs/design.md`](docs/design.md).
>
> **Origin:** reframe of [mdreview](https://github.com/sangminnn/mdreview) v1.x,
> moving from the markdown-only `block`/`range` dual model to a single
> `Selector`-based model that handles markdown, HTML, and (Phase 2) SVG / code /
> table cells with the same anchoring algorithm.

## Why

`mdreview` v1.x worked well for markdown plan review, but had five structural
limits — block definition tied to the markdown parser, a redundant
`block`/`range` dual mode, position-dependent anchors that broke on minor
document edits, no HTML input, and an ad-hoc `anchorHint` text-search escape
hatch.

`htmlreview` reframes the model around **one Selector type** (W3C
`TextQuoteSelector` / `RangeSelector` / `FragmentSelector` / `XPathSelector` /
`CssSelector` / `SvgSelector`) with a fuzzy-text fallback chain (`refinedBy`),
using the production-tested Hypothesis [`dom-anchor-text-quote`](https://github.com/hypothesis/dom-anchor-text-quote)
algorithm. The submit payload is a valid W3C `Annotation` — interoperable with
any standard-conformant annotation tool.

## Quick start

> coming soon (Milestone M7)

## Milestones

| M | Description | Status |
|---|---|---|
| M0 | Schema design ([docs/design.md](docs/design.md)) | ✅ |
| M1 | `src/selector.mjs` + unit tests | ⏳ |
| M2 | Semantic HTML renderer | ⏳ |
| M3 | Client UI rewrite (selector-based) | ⏳ |
| M4 | `bin/` + server with W3C `Annotation` payload | ⏳ |
| M5 | revision-report v2 input schema | ⏳ |
| M6 | HTML input + `sanitize-html` | ⏳ |
| M7 | Docs + `CHANGELOG` 1.0.0 | ⏳ |

## License

MIT
