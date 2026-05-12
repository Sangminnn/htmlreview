---
name: htmlreview
description: Human-in-the-loop review gate. Open a markdown or HTML plan in a local web page, let the user comment on text selections (W3C Web Annotation), and pull back a W3C AnnotationCollection JSON when they click "진행". Use as the final step of any planning skill before execution.
---

# htmlreview

Local web review gate for markdown and HTML documents. Pulls back
**W3C-compliant annotations** (`TextQuoteSelector`) when the user approves
or revises a plan.

## When to use

Use **before executing any non-trivial plan** that you (the agent) have drafted.

1. The user reviews the plan in their browser.
2. They highlight any text and add a comment (optionally with images).
3. When they click *진행* the CLI exits with status 0 and emits an
   `AnnotationCollection` JSON on stdout.
4. Parse `status`:
   - `"approved"` → proceed with execution.
   - `"revision_requested"` → fold the comments back into the plan, then call
     this skill again with the previous output as `--revision-report`.

## How to invoke

```bash
# markdown plan via stdin
echo "$PLAN_MARKDOWN" | htmlreview --title "Plan review" --timeout 600

# from a file (extension is auto-detected)
htmlreview plan.md --title "Plan review" --timeout 600

# HTML input
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
