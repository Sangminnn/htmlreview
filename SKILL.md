---
name: htmlreview
description: Human-in-the-loop review gate. Open a markdown or HTML plan in a local web page, let the user comment on text selections (W3C Web Annotation), and pull back a W3C AnnotationCollection JSON when they click "진행". Use as the final step of any planning skill before execution.
---

# htmlreview

Local web review gate for markdown and HTML documents. Pulls back
**W3C-compliant annotations** (`TextQuoteSelector`) when the user approves
or revises a plan.

## When to use

Use **whenever your current response is hard to grasp from terminal text alone** — i.e. the user would need to mentally render a wall of markdown to understand it. Typical triggers:

- Non-trivial **plans / designs / reports** drafted by the agent before execution.
- Long markdown responses with **structure that benefits from spatial layout** — comparisons (table / grid), flows (svg flowchart / `<details>` steps), interactive demos (iframe sandbox).
- The user asks to **"see it visually" / "검토 띄워줘" / "직관적으로 보여줘"** , or you (the agent) judge that text-only ping-pong is losing information.
- A previous round's review surfaced comments and you want the user to **confirm your resolutions** in context — pass the previous `AnnotationCollection` as `--revision-report`.

Flow:

1. The agent crafts the artifact (see *Authoring guidance* below).
2. The user reviews the page in their browser — hover/click/drag for comments, optionally attach images.
3. When they click *진행* the CLI exits with status 0 and emits a W3C `AnnotationCollection` on stdout.
4. Parse `status`:
   - `"approved"` → proceed.
   - `"revision_requested"` → fold the comments back into the artifact, then call this skill again with the previous output as `--revision-report`.

## Authoring guidance — *make it readable, not skim-bait*

This skill renders the input as-is. If you hand it a markdown wall, the user gets a wall. Prefer richer HTML when it earns its keep:

| Intent | Use |
|---|---|
| Side-by-side comparison | `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">` |
| Tabular contrast | `<table>` — auto-wrapped in a figure, comment any cell / row / table |
| Flow · architecture · sequence | inline `<svg>` with `<rect>` / `<line>` / `marker-end` arrows |
| Long reasoning / alternatives / FAQ | `<details><summary>...</summary>...</details>` (optionally `open`) |
| Tabs without JS | `<input type="radio">` + `<label>` + CSS `:checked` |
| Interactive demo (slider / drag / live re-render) | `<iframe sandbox="allow-scripts" srcdoc="...self-contained HTML+JS..."></iframe>` |
| Severity / decision matrix | `<table>` with `<mark>` or inline-styled cells |
| Inline code · diffs | fenced code blocks (` ```diff `, ` ```ts ` …) |

Headings get auto id slugs (incl. Korean) so deep links `[해당 섹션](#slug)` work.

Allowed but JS-blocked: `<style>`, `<input type="checkbox|radio|range">`, `<svg>`. Blocked: `<script>` (use iframe sandbox), `<form>` with submit, `<iframe src=...>` (only `srcdoc` allowed, `sandbox` forced).

## How to invoke

```bash
# markdown plan via stdin
echo "$PLAN_MARKDOWN" | htmlreview --title "Plan review" --timeout 600

# from a file (extension is auto-detected)
htmlreview plan.md --title "Plan review" --timeout 600

# HTML input — preferred when you've authored a rich artifact (see above)
htmlreview design.html --title "Design review"

# subsequent rounds — show previous comments + your resolutions
htmlreview plan.md --revision-report round-1.json --title "Round 2"
```

## Output schema

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
      "created": "<ISO 8601>",
      "body": [
        { "type": "TextualBody", "value": "...", "format": "text/plain", "purpose": "commenting" }
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

See [`reviewer.md`](reviewer.md) for the multi-round workflow and
[`example.md`](example.md) for end-to-end shell + jq usage.
