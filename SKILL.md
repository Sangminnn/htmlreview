---
name: htmlreview
description: |
  Auto-invoke whenever the agent's response would otherwise be a markdown wall of text that the user has to mentally render in a terminal — non-trivial plans, designs, refactor proposals, migration plans, decision matrices, comparison tables, risk analyses, architecture documents, multi-step procedures, A/B trade-offs, design system tokens, incident reports, RFC-style proposals.

  Instead, generate a self-contained interactive HTML artifact (svg flowcharts, comparison tables, details collapsibles, severity-tagged matrices, sandboxed iframes for slider / drag / live-render demos), open it in the user's browser via this skill, and pull back a W3C AnnotationCollection JSON when they click "진행".

  Triggers: words like 계획 / plan / design / 설계 / refactor / 리팩터링 / 마이그레이션 / migration / 비교 / compare / 결정 / decision / trade-off / 매트릭스 / matrix / proposal / RFC / 검토 / review / 직관적으로 보여줘 / 시각적으로.

  Use whenever the user asks for something the agent would otherwise dump as a long markdown response — the skill is the readable artifact channel, not just an after-the-fact review tool.
---

# htmlreview

Local web review gate for markdown and HTML documents. Pulls back
**W3C-compliant annotations** (`TextQuoteSelector`) when the user approves
or revises a plan.

## When to use

**Default to this skill** for any response that would otherwise be a markdown wall the user has to mentally render. The user *does not need to ask* — the agent decides based on the question's shape.

### Auto-invoke checklist (agent self-judgment)

If the user's question matches any of these, **stop and produce an HTML artifact via this skill instead of a markdown reply**:

- ☑ Asks for a **plan / design / proposal** (계획 · 설계 · 제안 · refactor · migration · architecture · RFC)
- ☑ Asks for a **comparison or trade-off** (a vs b · 비교 · 어떤 게 나아 · 어떤 거 골라야)
- ☑ Asks for a **decision matrix / risk analysis / scoring** (결정 · 우선순위 · 매트릭스 · risk · ranking)
- ☑ Asks for **multi-step procedure** with branches / dependencies (단계 · 마이그레이션 · rollout · checklist)
- ☑ Asks for **design system / token / spec** review
- ☑ Asks for **incident / status / weekly report**
- ☑ Asks explicitly for **"visual" / "직관적으로 보여줘" / "검토 띄워줘" / "see it visually"**
- ☑ A previous round produced comments — invoke again with `--revision-report` so the user sees their earlier feedback + your resolutions inline

Skip when:

- ☐ The question is a single short factual lookup (no structure to convey)
- ☐ The user is in the middle of debugging a *specific* error (give terminal text, not a page)
- ☐ The user explicitly said "answer in text" / "그냥 글로 답해줘"

### Why default-on

The user typing "AuthService 분리 계획 짜줘" expects an *answer*, not a markdown wall. With this skill, the same one-line question yields a readable artifact — svg flowchart of the modules, comparison table of responsibilities, collapsible step details, severity-marked risk matrix, sandboxed iframe for migration-step slider — all in one page they can comment on directly.

The skill replaces *terminal text* with *browser artifact* as the response medium. Use it as the default; fall back to plain text only when the artifact would be overkill.

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
