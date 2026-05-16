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
```

| 옵션 | 기본값 | 비고 |
|---|---|---|
| `--title <text>` | `Review` | 브라우저 탭 / 상단 헤더 타이틀 |
| `--port <n>` | random ephemeral | HTTP 포트 |
| `--no-open` | — | 브라우저 자동 열기 안 함 |
| `--input-format <md\|html>` | 확장자 추론 | 입력 형식 강제 |
| `--revision-report <file>` | — | 이전 라운드 `AnnotationCollection` JSON |
| `--timeout <seconds>` | — | N초 내 제출 없으면 실패 종료 |
| `-v / --version` | — | 버전 출력 |
| `-h / --help` | — | 도움말 |

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

## Inspired by

- [**mdreview**](https://github.com/sangminnn/mdreview) — markdown 전용 전작. htmlreview 는 `block` / `range` 이중 모델을 단일 `Selector` 로 통합하고 HTML 입력까지 확장
- [**W3C Web Annotation Data Model**](https://www.w3.org/TR/annotation-model/) — 이 프로젝트가 그대로 따르는 표준 schema. 자체 JSON 형식 없음 → federation 가능
- [**Hypothesis `dom-anchor-text-quote`**](https://github.com/hypothesis/dom-anchor-text-quote) — production 검증된 DOM Range ↔ TextQuoteSelector anchoring + `diff-match-patch` fuzzy 매칭
- [**Thariq, "HTML Effectiveness"**](https://thariqs.github.io/html-effectiveness/) — *agent 가 self-contained HTML 산출물* (공간 배치 / live 렌더 / collapsible / throwaway interaction 포함) 을 만들면 *skim* 이 아니라 *read* 가 일어난다는 비전. htmlreview 는 그 산출물의 *리뷰어측 게이트*

## License

MIT
