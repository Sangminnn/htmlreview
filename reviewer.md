# Reviewer integration procedure

This document describes how to integrate `htmlreview` as a human-in-the-loop
gate in a Claude Code agent or skill workflow.

## 1. Run the gate before executing

### When to call

Trigger `htmlreview` whenever the current artifact would lose information if the user only saw it as terminal text:

- Non-trivial **plans / designs / reports** the agent drafted.
- User says **"see it visually" / "검토 띄워줘" / "직관적으로 보여줘"** (or equivalent).
- The agent judges that *text-only ping-pong is losing structural information* — tables, flows, side-by-side comparisons, interactive demos.

### Author for the page, not the terminal

Markdown is fine for simple text, but prefer richer HTML when it earns its keep:

| Intent | Use |
|---|---|
| comparisons | `<table>` or `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">` |
| flow · architecture · sequence | inline `<svg>` with `<rect>` / `<line>` / `marker-end` |
| long reasoning · alternatives · FAQ | `<details><summary>…</summary>…</details>` |
| tabs without JS | `<input type="radio">` + `<label>` + CSS `:checked` |
| interactive demo (slider / drag / live re-render) | `<iframe sandbox="allow-scripts" srcdoc="…self-contained HTML+JS…"></iframe>` |

See [`SKILL.md`](SKILL.md) §Authoring guidance for the full intent→element mapping. Heading id slugs are auto-generated (incl. Korean) so deep links `[해당 섹션](#slug)` work.

### Open the gate

Then open the artifact for review:

```bash
echo "$PLAN_MARKDOWN" | htmlreview --title "Plan review" --timeout 600
```

The exit code is **0** on submission, **non-zero** only on input errors or
timeout. Read the JSON from stdout.

## 2. Parse the result

```js
const result = JSON.parse(stdoutText);

if (result.status === "approved") {
  // No comments. Proceed with execution.
} else if (result.status === "revision_requested") {
  for (const ann of result.items) {
    const selector = ann.target.selector;        // { type, exact, prefix, suffix }
    const comment  = ann.body.find(b => b.purpose === "commenting")?.value || "";
    const images   = ann.body.filter(b => b.type === "Image").map(b => b.value);
    // Revise the plan based on (selector, comment, images)
  }
}
```

## 3. Multi-round revision

After revising the plan, supply the **previous** `AnnotationCollection` as
`--revision-report` so the user sees a sidebar of their earlier comments
*and* your resolutions in-place:

```bash
htmlreview revised-plan.md --revision-report round-1.json --title "Round 2"
```

Before passing `round-1.json` back, append a `TextualBody` with
`purpose: "describing"` to each item's `body[]`. The first body remains the
user's original comment; the second is your resolution text:

```json
{
  "body": [
    { "type": "TextualBody", "value": "user's original comment",   "purpose": "commenting" },
    { "type": "TextualBody", "value": "how you addressed it",      "purpose": "describing" }
  ]
}
```

The client renders both in the sidebar card and places a *"변경됨"* badge
at the original selector's resolved location in the body.

## 4. Selector resilience

`htmlreview` uses the Hypothesis `dom-anchor-text-quote` algorithm. A
selector remains resolvable as long as:

- The `exact` text is still present (verbatim or near-verbatim via the
  built-in `diff-match-patch` fuzzy fallback).
- `prefix` and `suffix` (32 chars on each side) provide enough context to
  disambiguate when the same `exact` appears multiple times.

When the selector cannot be resolved at all, the annotation is **still
present** in the output JSON — only the in-body highlight / badge is
suppressed. The sidebar card still renders so no comment is lost.

## 5. Timeouts and cancellation

- `--timeout <seconds>` — non-zero exit if the user does not submit. Always
  set this in agent workflows.
- The user can close the browser tab; the server stays open until the
  timeout fires.
- The CLI process exits cleanly when `POST /submit` is received, regardless
  of whether the browser is still open.

## 6. Schema constraint

All items in `result.items` are valid W3C `Annotation` objects. You can store
them in any annotation system that consumes the W3C Web Annotation Data Model
without converting the shape.
