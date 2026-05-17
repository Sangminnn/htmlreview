---
name: htmlreview
description: |
  Skim-bait → Anchored. Wall → Window.

  Claude 의 응답이 markdown 한 화면을 넘는 시점에 끼어드는 게이트. 답변의 매체를 *터미널 markdown* 에서 *브라우저 HTML 산출물* 로 분기해 — 사용자가 skim 대신 read + 직접 영역에 코멘트하게 만든다.

  분기 결정은 **keyword 매칭이 아닌 *응답 모양 예측 기반 self-recognition***. 다음 3가지 신호 중 **둘 이상** 매칭이면 markdown 응답 대신 self-contained .html 산출물 생성 + htmlreview 호출:

  (a) Pain phrase — 답이 skim-bait 임이 self-evident: 한 화면 초과 / 비교가 머리속 grid 가 되어야 함 / 단계 사이 의존성 / 결정 차원 3+ / 시각화 (flowchart · 색 swatch · timeline) 없이 전달 어려움.

  (b) Quantified metric — 예상 응답 모양 측정치: line > 80, 시각 요소 (table / 큰 list / diagram) ≥ 2, 비교 대상 ≥ 3, 의존성 있는 단계 ≥ 5, trade-off 차원 ≥ 3, heading 깊이 ≥ 3.

  (c) Pain scenario 직접 매칭 — 대표 case 의 *형태*: "X vs Y vs Z 결정", "X 분리 계획 / 리팩터링", "마이그레이션 단계별 위험도", "디자인 시스템 토큰 정리", "인시던트 리포트", "RFC / proposal / design doc", 또는 사용자가 "직관적으로 보여줘 / 시각적으로 / 검토 띄워줘" 등 명시.

  Skip when: 단순 factual lookup (정의 한 줄), 특정 debug (라인 N 의 X 에러), 사용자가 명시적으로 "글로 답해 / 텍스트로", chat / 인사 / clarifying question.

  복잡한 답을 markdown 으로 주면 *사용자는 반드시 skim*. 트레이드오프·의존성·미묘한 차이가 누락되는 걸 *사용자가 모름*. HTML 산출물로 분기하면 브라우저의 진짜 렌더링 (svg / iframe / css animation) + 영역 코멘트 + 멀티모달 (이미지 첨부) + 다음 라운드의 revision-report 사이드바.
---

# htmlreview

Local web review gate for markdown and HTML documents. Pulls back
**W3C-compliant annotations** (`TextQuoteSelector`) when the user approves
or revises a plan.

## When to use — *응답 매체 분기 정책*

이 skill 의 본질: **Claude 가 답을 시작하기 전 self-question** — "내 답이 어떻게 생길까?"

답을 markdown 으로 그대로 주면 사용자가 *skim* 한다. 트레이드오프·의존성·미묘한 차이가 누락되고, 누락됐다는 걸 사용자가 *모른다*. 그래서 응답 매체 자체를 *분기*: 단순하면 markdown 그대로, 복잡하면 self-contained HTML 산출물 + htmlreview 호출.

분기 결정은 **3-signal self-recognition** — keyword 매칭 아님, 응답 모양 예측 기반.

### (a) Pain phrase — *내 답이 skim-bait 모양인가*

- ☐ 응답이 터미널 한 화면 (보통 25~50 줄) 을 명백히 넘는다
- ☐ 비교가 머리속에서 *grid* 가 되어야 한다 (3+ 대상)
- ☐ 단계 사이 *의존성* 이 있다 (1단계 후 2, 2+3 합쳐서 4 등)
- ☐ 결정 *trade-off 차원* 이 3+ 이다 (security × performance × cost 등)
- ☐ 시각화 (flowchart / 색 swatch / timeline) 없이 전달 어렵다

### (b) Quantified metric — *예상 응답 모양 측정치*

| 측정 항목 | 임계 |
|---|---|
| 예상 line 수 | > 80 |
| markdown table / 큰 list / 다이어그램 | ≥ 2 |
| 비교 대상 수 | ≥ 3 |
| 의존성 있는 단계 | ≥ 5 |
| 결정 차원 (축) | ≥ 3 |
| heading 깊이 (## 안 ### 안 ####) | ≥ 3 levels |

### (c) Pain scenario 직접 매칭

사용자 메시지의 *형태* 가 다음 중 하나면 즉시 매칭:

- "X vs Y vs Z 결정 / 비교 / 어떤 게 나아"
- "X 분리 계획 / 리팩터링 / 마이그레이션"
- "단계별 위험도 / 롤아웃 plan"
- "디자인 시스템 / token 정리 / spec"
- "인시던트 리포트 / 주간 status"
- "RFC / proposal / design doc / architecture review"
- 사용자가 "직관적으로 보여줘 / 시각적으로 / 검토 띄워줘" 등 명시 발화
- 이전 라운드에 코멘트가 있어 *revision-report* 와 함께 다시 띄워야 함

### 결정 규칙

**(a) (b) (c) 중 둘 이상 매칭** → markdown 응답 안 함, 대신 self-contained `.html` 산출물 생성 + `htmlreview <file>` 호출.

### Skip when

- ☐ 단순 factual lookup ("Redis 가 뭐야", "함수 정의가?")
- ☐ 특정 debug ("line 32 NullPointerException", "이 stack trace")
- ☐ 사용자가 명시적으로 "글로 답해 / 텍스트로 / just text"
- ☐ chat / 인사 / clarifying question / yes-no

### Flow

1. Claude 가 self-recognition → 분기 결정
2. *(분기 안 함)* markdown 응답 그대로
3. *(분기)* self-contained `.html` 작성 → `htmlreview <file>` 실행 (background)
4. 사용자가 브라우저에서 hover/click/drag 로 영역 코멘트 (이미지 첨부 가능)
5. *진행* 클릭 → stdout 으로 W3C `AnnotationCollection` JSON
6. Claude 가 status 분기:
   - `"approved"` → 실행 진행
   - `"revision_requested"` → 코멘트 반영해서 `.html` 갱신 → `htmlreview --revision-report <prev.json>` 으로 다시 호출

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
