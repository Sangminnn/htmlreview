# Example: review a plan and process the result

End-to-end shell example that invokes the review gate and routes on `status`.

```bash
PLAN='# Refactor plan

## Steps

1. Refactor AuthService
2. Introduce JwtVerifier
3. Replace SessionStore
'

RESULT=$(echo "$PLAN" | htmlreview --title "Refactor plan" --timeout 600)

STATUS=$(echo "$RESULT" | jq -r '.status')
echo "Review status: $STATUS"

if [ "$STATUS" = "approved" ]; then
  echo "Proceeding with execution."
else
  echo "User requested revision. Comments:"
  echo "$RESULT" | jq -r '
    .items[]
    | "- [\(.target.selector.exact)] \(.body[0].value)"
  '
fi
```

## Example output (`status: "revision_requested"`)

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "AnnotationCollection",
  "status": "revision_requested",
  "target": {
    "source": "urn:htmlreview:doc:91d247fe87b834c4",
    "format": "text/markdown"
  },
  "items": [
    {
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "type": "Annotation",
      "id": "urn:htmlreview:annotation:5ad8aa92-1386-44a4-870c-afa17b13216c",
      "motivation": "commenting",
      "created": "2026-05-12T08:30:00.000Z",
      "body": [
        {
          "type": "TextualBody",
          "value": "JwtVerifier 도입 전에 기존 호출처 위험도 분석이 필요해 보입니다.",
          "format": "text/plain",
          "purpose": "commenting"
        }
      ],
      "target": {
        "source": "urn:htmlreview:doc:91d247fe87b834c4",
        "format": "text/markdown",
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "Introduce JwtVerifier",
          "prefix": "1. Refactor AuthService 2. ",
          "suffix": " 3. Replace SessionStore"
        }
      }
    }
  ]
}
```
