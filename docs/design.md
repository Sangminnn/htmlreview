# htmlreview — Selection 기반 review 도구 설계

> Status: founding design · 2026-05-12 · v1.0 마일스톤 가이드
> 원본: mdreview v1.x (markdown 전용) 의 후속 reframe — block/range 이중성 폐기 + HTML/SVG 입력 지원이 동기.
> 본문 곳곳의 "v1 → v2" 표현은 mdreview 의 v1.x → htmlreview v1.0 으로 읽으세요. M7 단계에서 polish.

## 0. 한눈에

v1.x 의 `kind: "block" | "range"` 이중 모델을 폐기하고, 모든 코멘트 대상(target)을 **W3C Web Annotation Data Model 의 Selector** 로 단일화한다. markdown / HTML / (Phase 2 에서 SVG · code-line · table-cell) 까지 같은 모델로 anchoring 한다.

- **표준**: [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- **클라이언트 anchoring**: Hypothesis 의 [`dom-anchor-text-quote`](https://github.com/hypothesis/dom-anchor-text-quote) 알고리즘 (TextQuote ↔ TextPosition ↔ Range, diff-match-patch fuzzy)
- **출력 호환성**: v2 payload 는 표준 `Annotation` 객체 그대로 → 외부 도구 / federation 가능
- **마이그레이션**: v1 → v2 는 **breaking change** (v1 필드 완전 제거, 메이저 bump)

---

## 1. 배경 — v1.1 의 5가지 구조적 한계

| # | 한계 | 증상 |
|---|---|---|
| 1 | 블록 정의가 `marked.lexer` 의존 | li/tr 만 sub-block, table-cell / code-line / inline-span 표현 불가 |
| 2 | `kind` 이중성 (block vs range) | range 도 결국 `blockIds[]` 폴백, `selectedText` 별도 필드로 우회 |
| 3 | 위치 의존 anchor | `blockIndex` 강함 → 문서 살짝만 바뀌어도 매칭 깨짐. `contentHash` raw 80자 = 짧음 |
| 4 | HTML 입력 불가 | `marked.lexer` 통과 못 하는 산출물(SVG / widget / raw HTML) 검토 못 함 |
| 5 | `anchorHint` 가 임시변통 | revision-report 가 *텍스트 검색*으로 anchor 찾음 — 시스템 자체가 "텍스트가 더 안정적"임을 인정 |

#5 는 v1.1 에 이미 v2 의 TextQuoteSelector 가 어색하게 들어가 있다는 신호다. v2 는 이를 정식 모델로 승격한다.

---

## 2. 설계 원칙

1. **표준 채택 (자체 발명 금지)** — Annotation / Target / Selector 는 W3C 스펙 필드명 그대로. 우리 확장은 W3C 가 허용하는 추가 필드로만.
2. **단일 Selection** — `kind` 분기 폐기. 모든 코멘트는 `target.selector` 하나로 표현.
3. **입력 매체 무관** — markdown 도 결국 HTML 로 렌더된 뒤 anchoring 함. SVG / code / table-cell 도 같은 selector 어휘로 표현 가능.
4. **폴백 체인** — `refinedBy` 로 1차/2차 selector 합성. 1차 실패 시 2차로 fallback.
5. **클라이언트 anchoring** — 서버는 블록 ID 부여하지 않음. 클라이언트가 DOM Range ↔ Selector 변환을 책임.

---

## 3. 데이터 모델

### 3.1 Annotation 루트

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "id": "urn:mdreview:annotation:01HF...",
  "type": "Annotation",
  "motivation": "commenting",
  "created": "2026-05-12T08:30:00Z",
  "body": [
    { "type": "TextualBody", "value": "코멘트 본문", "format": "text/plain" }
  ],
  "target": { /* §3.2 */ }
}
```

| 필드 | 필수 | 비고 |
|---|---|---|
| `@context` | ✓ | 고정값 `http://www.w3.org/ns/anno.jsonld` |
| `id` | ✓ | `urn:mdreview:annotation:<ulid>` |
| `type` | ✓ | 고정값 `"Annotation"` |
| `motivation` | ✓ | `"commenting"` (1차 코멘트) 또는 `"replying"` (resolution 응답) |
| `body` | ✓ | `TextualBody` + 옵션 이미지 body 배열 |
| `target` | ✓ | §3.2 |
| `created` | 권장 | ISO 8601 |

이미지 첨부는 body 배열에 추가:
```json
{ "type": "Image", "format": "image/png", "value": "data:image/png;base64,..." }
```

### 3.2 Target

```json
{
  "source": "urn:mdreview:doc:<sha256-of-input>",
  "format": "text/markdown",
  "selector": { /* §3.3 */ }
}
```

| 필드 | 필수 | 비고 |
|---|---|---|
| `source` | ✓ | 입력 문서 식별자. 파일 경로 대신 내용 해시 기반 URN (재현성) |
| `format` | 권장 | `text/markdown` / `text/html` / `image/svg+xml` |
| `selector` | ✓ | 단일 selector 또는 selector 배열 (둘 다 같은 컨텐츠 지칭) |

### 3.3 Selector union (채택 목록)

채택할 selector 와 비채택 사유:

| Selector | 채택 | 용도 |
|---|---|---|
| `TextQuoteSelector` | ✓ 1순위 | 모든 코멘트의 기본 anchor. 가장 robust |
| `RangeSelector` | ✓ | 여러 노드 가로지르는 범위 (`startSelector` + `endSelector`) |
| `FragmentSelector` | ✓ | heading 단위 anchor (e.g. `#impl-plan`) |
| `XPathSelector` | ✓ | DOM 정확 노드 지정 (재렌더 변동 없는 노드에 유용) |
| `CssSelector` | ✓ | XPath 의 사람 친화 대체 |
| `SvgSelector` | △ Phase 2 | SVG 산출물 안의 도형 선택 |
| `TextPositionSelector` | ✗ | 문자 offset — markdown 재렌더 시 깨짐 |
| `DataPositionSelector` | ✗ | 바이트 offset — 동일 |

#### 3.3.1 TextQuoteSelector

```json
{
  "type": "TextQuoteSelector",
  "exact": "선택된 정확한 텍스트",
  "prefix": "앞쪽 32자 context",
  "suffix": "뒤쪽 32자 context"
}
```

`prefix` / `suffix` 는 동일 `exact` 가 여러 군데 나타날 때 disambiguation 용. Hypothesis 의 32자 관행 채택.

#### 3.3.2 RangeSelector

```json
{
  "type": "RangeSelector",
  "startSelector": { "type": "TextQuoteSelector", "exact": "범위 시작 텍스트" },
  "endSelector":   { "type": "TextQuoteSelector", "exact": "범위 끝 텍스트" }
}
```

#### 3.3.3 FragmentSelector (heading anchor)

```json
{
  "type": "FragmentSelector",
  "value": "section-impl-plan",
  "conformsTo": "https://tools.ietf.org/html/rfc3986"
}
```

렌더러가 heading 마다 안정적 id 를 부여한다 (`slugify(headingPath.join("/"))`).

#### 3.3.4 XPathSelector / CssSelector

```json
{ "type": "XPathSelector", "value": "//section[@id='impl-plan']/ul[1]/li[2]" }
```

### 3.4 refinedBy — 폴백 체인 패턴

W3C: "여러 selector 가 같은 컨텐츠를 지칭해야 하며, 다르면 consumer 가 하나 선택한다." 우리는 이를 **폴백 우선순위**로 사용한다.

표준 패턴 (대부분의 코멘트):

```json
{
  "type": "FragmentSelector",
  "value": "section-impl-plan",
  "refinedBy": {
    "type": "TextQuoteSelector",
    "exact": "AuthService 슬림화",
    "prefix": "step 3. ",
    "suffix": " — 호출처 50곳"
  }
}
```

resolve 순서:
1. `FragmentSelector` 로 heading 노드 찾음 → 그 subtree 안에서
2. `TextQuoteSelector.exact` 매칭 (prefix/suffix 로 disambiguation)
3. 정확 매칭 실패 시 diff-match-patch fuzzy 매칭

#### 3.5 우리 확장 — `semanticRole`

W3C 가 허용하는 사용자 정의 필드. selector 어떤 종류의 노드를 가리키는지 힌트.

```json
{ "type": "TextQuoteSelector", "exact": "...", "semanticRole": "list-item" }
```

**열거형 (미해결 — §8 참조)**:
`heading` · `paragraph` · `list-item` · `table-cell` · `code-line` · `figure` · `inline-span` · `svg-shape`

UI 렌더링 결정(아이콘 / 카드 라벨 / 코멘트 그룹화) 에만 사용. anchoring 정확성에는 비기여.

---

## 4. Anchoring 알고리즘

### 4.1 createSelector(range) — 사용자가 텍스트 선택했을 때

입력: DOM `Range`
출력: `Selector` 객체

```
1. range.startContainer 의 가장 가까운 heading 조상 → FragmentSelector { value: headingId }
2. range.toString() → TextQuoteSelector { exact, prefix(32), suffix(32) }
3. range 가 한 노드 안 → 단일 TextQuoteSelector + FragmentSelector(refinedBy)
   range 가 노드 가로지름 → RangeSelector { startSelector, endSelector }
4. 선택된 노드가 단일 element 면 추가로 CssSelector 부착 (refinedBy chain 끝)
```

`dom-anchor-text-quote` 의 `fromRange(root, range)` 가 #2 를 담당. 그 외 단계는 우리 코드.

### 4.2 resolveSelector(target) → `Range | null`

폴백 체인 순서대로 시도:

```
1. FragmentSelector → document.getElementById(value) → subtree root 확정
   (없으면 document.body 가 root)
2. refinedBy 가 있으면 TextQuoteSelector 단계로 진입
3. dom-anchor-text-quote.toRange(root, selector, {hint?})
4. 결과 null 이면:
   4a. RangeSelector 면 startSelector / endSelector 각각 resolve 후 Range 조립
   4b. XPathSelector / CssSelector fallback
5. 모두 실패 → null + UI 에 "anchor 유실" 표시 (코멘트는 카드 형태로만 노출)
```

### 4.3 fuzzy 매칭 정책

- `dom-anchor-text-quote` 가 기본으로 fuzzy 활성 — `diff-match-patch` 의존성 추가 필요
- 매칭 threshold: 라이브러리 기본값 사용 (별도 설정 없음, 검증된 production 기본값)
- `hint` 옵션: 최근 클릭 / 스크롤 위치를 hint 로 넘겨 가까운 후보 우선

### 4.4 의존성 추가

```json
"dependencies": {
  "marked": "^14.1.3",
  "dom-anchor-text-quote": "^4.0.2",
  "dom-anchor-text-position": "^4.0.2"
}
```

번들 크기 영향은 본문 측정 단계에서 검증 (구현 시 §7 마일스톤).

> ⚠️ 미검증: 위 버전은 npm 등록된 최신 추정. 구현 시 `npm view` 로 실제 최신/안정 버전 확인 필요.

---

## 5. 입력 매체별 동작

### 5.1 Markdown

- `marked` 로 토큰 → HTML 변환 (지금처럼)
- **변경점**: `data-block-id` / `data-anchor` 어트리뷰트 부여 폐기
- heading 토큰만 `id="<slug>"` 부여 (FragmentSelector 의 target)
- 결과 HTML 은 **시맨틱 태그만** (`<section>`, `<h1..h6>`, `<p>`, `<li>`, `<table>`, `<pre>`, `<figure>`)

### 5.2 HTML

- bin 이 `.html` 확장자 받음 / `--input-format html` 플래그
- **sanitize 정책 (미해결 — §8)** 통과 후 그대로 렌더
- heading id 자동 부여 (없으면 텍스트 slug, 충돌 시 `-2` 추가)
- 그 외에는 markdown 케이스와 동일하게 anchoring

### 5.3 Phase 2 — SVG · code-line · table-cell

설계 레벨만 명시. v2.0 구현엔 미포함, v2.1 / v2.2 로 분산.

**code-line** (block code 내 라인 단위):
```json
{
  "type": "XPathSelector",
  "value": "//pre[@data-lang='ts']/code/span[@data-line='42']",
  "semanticRole": "code-line",
  "refinedBy": { "type": "TextQuoteSelector", "exact": "const x = ..." }
}
```
→ 렌더러가 `<pre><code><span data-line="N">…</span>…</code></pre>` 형태로 출력하기만 하면 selector 채택 가능.

**table-cell**:
```json
{
  "type": "CssSelector",
  "value": "table#metrics > tbody > tr:nth-child(3) > td:nth-child(2)",
  "semanticRole": "table-cell"
}
```

**svg-shape**:
```json
{
  "type": "SvgSelector",
  "value": "<svg ...><path d='M10,10...'/></svg>",
  "semanticRole": "svg-shape"
}
```
W3C `SvgSelector` 그대로. SVG 클립을 inline 으로 보존하면 figure 안 도형도 같은 모델로 표현됨.

이들 모두 §3 의 selector union 안에 이미 포함 → schema 변경 없이 단계적 도입 가능.

---

## 6. 출력 / 입력 schema

### 6.1 v2 submit payload (stdout)

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "AnnotationCollection",
  "status": "approved",
  "target": { "source": "urn:mdreview:doc:<sha256>", "format": "text/markdown" },
  "items": [ /* Annotation[] §3.1 */ ]
}
```

`status` 는 W3C 비표준이지만 mdreview 운영상 필수 → 확장 필드로 보존. 두 값:
- `approved` — 코멘트/추가 코멘트 없음, 진행 승인
- `revision_requested` — 코멘트 있음, 수정 요청

### 6.2 v2 revision-report (입력)

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "rounds": [
    {
      "label": "2라운드",
      "items": [
        {
          "type": "Annotation",
          "id": "urn:mdreview:annotation:01HF...",
          "motivation": "commenting",
          "body": [
            { "type": "TextualBody", "value": "원본 코멘트", "purpose": "commenting" },
            { "type": "TextualBody", "value": "반영 내역 텍스트", "purpose": "describing" }
          ],
          "target": { "source": "...", "selector": { /* §3.3 */ } }
        }
      ]
    }
  ]
}
```

`rounds[0]` = 가장 최근. `body[].purpose` 로 코멘트 vs 반영 내역 구분.

### 6.3 mdreview v1.x 와의 차이 (참고)

htmlreview v1.0 의 schema 는 mdreview v1.x 에서 다음 필드들을 *제거*한 결과다:

- `anchor.headingPath` / `anchor.blockIndex` / `anchor.contentHash`
- `kind` (block / range)
- `blockText`
- `selectedText` (top-level) → `TextQuoteSelector.exact` 로 흡수
- revision-report 의 `anchorHint` / `resolvedAnchorHint`
- annotation `id` 의 `b{n}-r...` 패턴 → `urn:htmlreview:annotation:<uuid-v4>`

mdreview v1.x payload 를 htmlreview 가 직접 받지 않는다 — 두 도구는 별개 프로젝트. 마이그레이션이 필요하면 변환 스크립트를 사용자가 작성.

---

## 7. 구현 단계 (마일스톤)

각 마일스톤은 별도 PR / 별도 사용자 확인 단계.

| M | 산출물 | 검증 |
|---|---|---|
| M0 | 본 문서 합의 (현재) | 사용자 승인 |
| M1 | `src/selector.mjs` — createSelector / resolveSelector + 단위 테스트 | 단위 테스트 통과 |
| M2 | 렌더러 변경 — semantic HTML, `data-block-id` 제거, heading id 부여 | smoke 시나리오 재정의 후 통과 |
| M3 | `web/app.js` 리라이트 — selector 기반 코멘트 UI | 손 검증 (3 시나리오 캡처 재생성) |
| M4 | bin / server 의 submit payload 를 W3C Annotation 형태로 전환 | end-to-end smoke 통과 |
| M5 | revision-report 입력 schema v2 로 전환 + 본문 "변경됨" 뱃지 매칭 | `demo-revision.json` 갱신 후 캡처 재생성 |
| M6 | HTML 입력 지원 (`--input-format html`) + sanitize | 별도 smoke 케이스 추가 |
| M7 | README / SKILL.md / reviewer.md / example.md 갱신 + CHANGELOG 2.0.0 | publish 직전 확인 |

Phase 2 (M8+, 별도 마일스톤):
- M8: code-line 렌더러 확장 (`<span data-line>`)
- M9: table-cell selector 검증
- M10: SVG 입력

---

## 8. 결정된 항목 (2026-05-12 확정)

| ID | 항목 | 결정 | 근거 |
|---|---|---|---|
| Q1 | HTML sanitize 라이브러리 | **sanitize-html** | 서버사이드(Node CLI) 친화. DOMPurify 는 jsdom 부담 큼 |
| Q2 | `semanticRole` 열거형 범위 | **§3.5 의 8개 그대로** (`heading` · `paragraph` · `list-item` · `table-cell` · `code-line` · `figure` · `inline-span` · `svg-shape`) | 각각 v1.1 UI 가 이미 다르게 처리하는 단위. 축약은 정보 손실, 확장은 YAGNI |
| Q3 | `id` URN 발급 정책 | **UUID v4** + 접두 `urn:mdreview:annotation:` | Node 빌트인 `crypto.randomUUID()` 로 의존성 0. 정렬은 `created` timestamp 로 충분 |
| Q4 | annotation `creator` 필드 사용 | **생략** | mdreview = 단일 사용자 도구. 멀티유저는 §10 향후 (그때 마이너 bump 로 추가 가능) |
| Q5 | `dom-anchor-text-quote` 의존성 추가 | **사용** (`dom-anchor-text-quote` + `dom-anchor-text-position`) | Hypothesis production 검증. 자체 fuzzy 매칭 휴리스틱 검증 부담이 의존성 부담보다 큼. 번들 크기 / Bun 호환성은 M1 단계에서 측정 |

이전 라운드 후보 / 비채택 사유는 git history(`docs(v2): Selection 단일화 설계 초안`) 의 원본 §8 참조.

---

## 9. 출처 / 검증 상태

### ✅ 검증 완료

- W3C Web Annotation Data Model 명세 — https://www.w3.org/TR/annotation-model/ — §3 의 selector 필드명 모두 스펙 그대로
- Hypothesis `dom-anchor-text-quote` 알고리즘 — https://github.com/hypothesis/dom-anchor-text-quote — API 시그니처 / Range↔TextPosition↔TextQuote 흐름 / diff-match-patch fuzzy 매칭 / 32자 prefix·suffix 관행

### ⚠️ 출처 인용, 직접 미검증

- `dom-anchor-text-quote ^4.0.2` 버전 번호 — 추정값. 구현 시 `npm view dom-anchor-text-quote version` 으로 실제 확인 필요

### ❌ 미검증 / 도약

- 번들 크기 영향 — 미측정. M1 단계에서 측정 필요
- diff-match-patch fuzzy threshold 기본값이 우리 markdown 시나리오에 충분한지 — 미검증. M1 의 단위 테스트로 검증

---

## 10. 향후 (v2 이후)

- 멀티 사용자 — `Annotation.creator` / `audience` 활용
- LSP-like resolve 서비스 — anchor 유실 시 서버측 fallback resolve
- federation — 다른 annotation 서버와 import/export (W3C 표준 그대로니까 별도 변환 불필요)
