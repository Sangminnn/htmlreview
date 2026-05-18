# htmlreview

[English](README.md) · [한국어](README.ko.md)

> 마크다운 / HTML 문서를 로컬 브라우저에서 검토하는 도구.
> Claude Code 스킬용 human-in-the-loop 게이트. [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) 기반.

문서를 브라우저에 띄우고, 사용자가 본문 어디에든 코멘트(필요시 이미지 첨부)를 달면, *진행* 버튼을 눌렀을 때 **W3C `AnnotationCollection` JSON** 으로 결과를 받습니다. 표준 형식이라 다른 annotation 도구와 호환 가능합니다.

## 스크린샷

![메인 뷰](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/main.png)

| 코멘트 버블 | revision 사이드바 |
|---|---|
| ![코멘트 버블](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/bubble.png) | ![revision 사이드바](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/revision.png) |

### Conversation review preset

![Conversation review preset](https://raw.githubusercontent.com/Sangminnn/htmlreview/main/docs/screenshots/conversation-review.png)

## 설치

```bash
npm install -g htmlreview
```

Node ≥ 18 필요.

## CLI

```bash
htmlreview plan.md
htmlreview plan.md --title "리팩토링 계획" --timeout 600
cat plan.md | htmlreview --input-format md

# HTML 입력 (sanitize-html 통과)
htmlreview design.html

# 다음 라운드 — 이전 라운드 코멘트와 반영 내역을 사이드바에 표시
htmlreview revised.md --revision-report round-1.json

# Conversation review — assistant 응답을 시각적 리뷰 산출물로 변환
htmlreview docs/examples/conversation-review.json --preset conversation-review
```

| 옵션 | 기본값 | 비고 |
|---|---|---|
| `--title <text>` | `Review` | 브라우저 탭 / 상단 헤더 타이틀 |
| `--port <n>` | random ephemeral | HTTP 포트 |
| `--no-open` | — | 브라우저 자동 열기 안 함 |
| `--input-format <md\|html>` | 확장자 추론 | 입력 형식 강제 |
| `--preset <name>` | — | 입력을 리뷰 전에 변환. 지원: `conversation-review` |
| `--revision-report <file>` | — | 이전 라운드 `AnnotationCollection` JSON |
| `--timeout <seconds>` | — | N초 내 제출 없으면 실패 종료 |
| `-v / --version` | — | 버전 출력 |
| `-h / --help` | — | 도움말 |

## Conversation review preset

agent 응답이 그대로 두면 skim-bait 이 될 때 사용합니다: 비교, 롤아웃 계획, 마이그레이션 위험도, 아키텍처 결정처럼 원문보다 구조 파악이 중요한 답변입니다.

입력은 JSON 입니다:

```json
{
  "title": "Checkout migration review",
  "userText": "We need to migrate checkout from a legacy session-based flow to a new payment orchestration service. Compare three rollout strategies, show the risks for inventory reservation and coupon rollback, and propose a phased plan that support, backend, and frontend can all review.",
  "assistantText": "## Recommendation\n\nUse a shadow-write rollout first..."
}
```

실행:

```bash
htmlreview docs/examples/conversation-review.json --preset conversation-review
```

preset은 시각화 필요도 점수, 감지된 신호, 문서 밀도, 구조 지도, 핵심 항목 후보, 접을 수 있는 원문 응답을 포함한 self-contained HTML 산출물을 만듭니다. 목표는 markdown을 HTML로 감싸는 것이 아니라, 텍스트 벽을 브라우저에서 검토 가능한 화면으로 바꾸는 것입니다.

## 출력 schema

W3C `AnnotationCollection` ([`docs/design.md`](docs/design.md) §6.1 참조):

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
        "source": "<같은 source URN>",
        "format": "text/markdown",
        "selector": {
          "type": "TextQuoteSelector",
          "exact": "선택된 텍스트",
          "prefix": "앞 32자 context",
          "suffix": "뒤 32자 context"
        }
      }
    }
  ]
}
```

- `status` 만 htmlreview 자체 확장 — 나머지는 모두 W3C 표준 그대로.
- 이미지 첨부는 `body[]` 에 `type: "Image"` + `data:` URL 형태로 추가.

전체 흐름 예시는 [`example.md`](example.md), Claude Code 스킬 manifest 는 [`SKILL.md`](SKILL.md), 다중 라운드 통합 절차는 [`reviewer.md`](reviewer.md) 참조.

## 지원 콘텐츠

마크다운은 [marked](https://github.com/markedjs/marked), HTML 입력은 [sanitize-html](https://github.com/apostrophecms/sanitize-html) 통과:

- 표준 마크다운 — heading (h1~h6, 한국어 포함 자동 id slug), 목록 (중첩·GFM 체크리스트), 표, blockquote, 코드 블록, 인라인 강조, 링크(http/https/mailto), 이미지
- 정적 인터랙티브 HTML — `<details>` / `<summary>`, 인라인 `<svg>` 다이어그램, CSS-only 탭, `<style>` 블록, 안전 inline `style` 속성
- **샌드박스 JS 영역** — `<iframe sandbox="allow-scripts" srcdoc="...">` 로 slider / drag-drop / live re-render / chart 데모. `allow-same-origin`, `allow-top-navigation` 제거. `src` 도 제거 (`srcdoc` 만)

지원 요소를 한 페이지에서 확인하려면 [`docs/showcase.md`](docs/showcase.md).

## 아키텍처

```
bin/htmlreview.mjs   CLI — argparse, 파일/stdin 입력, --revision-report 로더
src/server.mjs       HTTP 서버 — 페이지 빌드, /submit → AnnotationCollection
src/renderer.mjs     markdown → 시맨틱 HTML + heading id slug + figure wrap
src/sanitize.mjs     HTML 입력 sanitize (sanitize-html)
src/selector.mjs     DOM Range ↔ W3C TextQuoteSelector (dom-anchor-text-quote)
src/annotation.mjs   W3C Annotation envelope 빌더 + URN
web/src/app.mjs      클라이언트 — selection toolbar, 코멘트 버블, 하이라이트, revision 사이드바
web/index.html       페이지 템플릿 — __TITLE__ / __CONTENT__ / __REVISION_REPORT_JSON__
web/style.css        스타일시트
web/app.bundle.js    esbuild 산출물 (~106 kB, gitignored, npm publish 포함)
```

## Selector 견고성

`exact` 텍스트가 그대로 있고 32자 `prefix` / `suffix` 가 동일 단어 후보를 구분해주는 한 anchor 유지. 문서가 크게 바뀌면 `diff-match-patch` fuzzy fallback. 해소 못 해도 annotation 은 **출력 JSON 에 그대로 보존** — 본문 하이라이트만 생략. 상세는 `reviewer.md` §4.

## 개발

```bash
git clone https://github.com/Sangminnn/htmlreview.git
cd htmlreview
npm install
npm run build:client    # esbuild — web/src/app.mjs → web/app.bundle.js
npm test                # 36 단위 테스트 (node:test + jsdom)
npm run smoke           # end-to-end: stdin → render → 페이지 → submit → stdout
npm run capture         # Playwright 로 스크린샷 3장 → docs/screenshots/
```

## Founding idea — *이 프로젝트가 왜 존재하는가*

전제는 한 글에서 옵니다:

**[Thariq, "HTML Effectiveness"](https://thariqs.github.io/html-effectiveness/)** — 어떤 AI 에이전트가 markdown 벽 대신 *self-contained* `.html` 파일 20개를 만들었더니, 사람들이 *skim* 이 아니라 *read* 했다는 관찰. 핵심 주장: 에이전트가 HTML 의 고유 역량 — **공간 배치, live 렌더, collapsible/tabbed 구조, throwaway 인터랙션** — 을 활용하면 산출물이 *skim-bait* 가 아닌 *usable* 한 도구가 됨. side-by-side 비교, 인라인 SVG 다이어그램, slider 로 조정하는 애니메이션, drag 로 순위 매기는 ticket 보드 — 이 중 어느 것도 터미널 텍스트 벽으로는 옮길 수 없습니다.

**htmlreview 는 그런 산출물의 *리뷰어측 게이트*입니다.** 에이전트가 풍부한 HTML 을 만들면, 사용자는 브라우저에서 검토 / 어디든 코멘트 / 이미지 첨부; 결과는 W3C 표준 `AnnotationCollection` 으로 돌아와 에이전트가 다음 라운드에 활용. 그 다음 라운드에 사용자가 보면 이전 코멘트와 *반영 내역* 이 "변경됨" 뱃지로 본문에 나란히 표시.

Thariq 의 글이 *문제를 정의*해주지 않았다면 이 프로젝트는 여전히 `mdreview` — markdown 전용 리뷰 게이트 — 에 머물렀을 겁니다. 그 글이 있어서 모든 선택(W3C 셀렉터 / HTML 입력 / 인터랙션용 sandbox iframe / figure-wrap 다이어그램)이 한 줄로 정렬됩니다.

## Built on

- [**mdreview**](https://github.com/sangminnn/mdreview) — markdown 전용 전작. htmlreview 는 `block` / `range` 이중 모델을 단일 `Selector` 로 통합하고 HTML 입력까지 확장
- [**W3C Web Annotation Data Model**](https://www.w3.org/TR/annotation-model/) — 이 프로젝트가 그대로 따르는 표준 schema. 자체 JSON 형식 없음 → federation 가능
- [**Hypothesis `dom-anchor-text-quote`**](https://github.com/hypothesis/dom-anchor-text-quote) — production 검증된 DOM Range ↔ TextQuoteSelector anchoring + `diff-match-patch` fuzzy 매칭

## License

MIT
