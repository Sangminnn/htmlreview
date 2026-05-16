# htmlreview — 콘텐츠 요소 쇼케이스

이 문서는 htmlreview 가 자동으로 렌더링하는 **마크다운 + sanitize 허용 HTML** 의 범위를 한 번에 보여줍니다. 어떤 영역이든 hover · click · drag 로 코멘트를 달 수 있습니다.

## 1. 텍스트 강조

**굵게** · *기울임* · ~~취소선~~ · `inline code` · <mark>형광펜</mark> · <kbd>⌘</kbd>+<kbd>↵</kbd> 키보드 표시 · 위첨자 X<sup>2</sup> / 아래첨자 H<sub>2</sub>O

## 2. 헤딩 — h1~h6 자동 id slug

### 3차 헤딩
#### 4차 헤딩
##### 5차 헤딩
###### 6차 헤딩

각 heading 에 `id="slug"` 자동 부여 (한국어 보존). FragmentSelector 의 target 으로 활용.

## 3. 목록

평면 + 중첩 OK:

- 평면 항목
- 중첩 항목
  - 두 번째 레벨
    - 세 번째 레벨
- 마지막 항목

순서 있는 목록:

1. 첫 번째 단계
2. 두 번째 단계
3. 세 번째 단계

체크리스트 (GFM task list):

- [ ] 미완 작업
- [x] 완료 작업

## 4. 표

| 메트릭 | 변경 전 | 변경 후 | 개선율 |
|---|---|---|---|
| 응답 시간 | 800ms | 250ms | 68% ↓ |
| 메모리 | 1.2GB | 0.8GB | 33% ↓ |
| 코드 줄 수 | 12,000 | 8,500 | 29% ↓ |

표 외곽 figure wrap 으로 외곽 hit 영역 + 셀/행/표 단위 코멘트.

## 5. 인용

> "측정할 수 없는 것은 관리할 수 없다."
> — Peter Drucker

> 다중 단락 인용:
>
> 1. 인용 안 목록도 가능
> 2. <mark>형광펜</mark> 같은 inline 도 그대로

## 6. 링크 / 이미지

- 외부: [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/)
- 메일: [team@example.com](mailto:team@example.com)
- 인라인 이미지: ![placeholder](https://via.placeholder.com/120x80 "120×80 예시")

> sanitize 가 허용하는 URL 스킴: `http` · `https` · `mailto` 뿐. `javascript:` / `data:` 등은 자동 제거.

## 7. 코드 블록

JavaScript:

```js
const greet = (name) => `안녕, ${name}!`;
console.log(greet("htmlreview"));
```

TypeScript:

```ts
interface Selector {
  type: "TextQuoteSelector";
  exact: string;
  prefix?: string;
  suffix?: string;
}
```

Bash:

```bash
echo "$PLAN" | htmlreview --title "Plan review" --timeout 600
```

JSON:

```json
{
  "@context": "http://www.w3.org/ns/anno.jsonld",
  "type": "Annotation",
  "motivation": "commenting"
}
```

## 8. 수평선

위쪽 영역

---

아래쪽 영역

## 9. 의미 컨테이너 — HTML 인라인 보존

<section>
  <header><strong>섹션 헤더</strong></header>
  <p>section 안의 본문 단락입니다. <kbd>Tab</kbd> 으로 의미 단위를 탐색할 수 있습니다.</p>
  <footer>섹션 푸터</footer>
</section>

<aside>
💡 <strong>TIP</strong> — <code>&lt;aside&gt;</code> 는 부가 정보용입니다. 콜아웃·사이드바 패턴에 어울립니다.
</aside>

<figure>
  <figcaption>Figure caption — 다이어그램이나 이미지의 설명</figcaption>
  <p>여기에 SVG 다이어그램이나 이미지를 둘 수 있습니다.</p>
</figure>

## 10. 복합 예시 — 위 요소를 한 페이지에 함께

> **결정 사항**
>
> 1. `JwtVerifier` 도입 → 토큰 검증 책임 분리
> 2. <mark>SessionStore</mark> 분리 → 영속화 책임 격리
> 3. `PermissionChecker` 분리 → 정책 평가

| 구분 | 우선순위 | 담당 |
|---|---|---|
| 보안 | <strong>높음</strong> | 인프라팀 |
| 성능 | 중간 | 백엔드팀 |
| 가독성 | 보통 | 모든 인원 |

```diff
- AuthService.verifyToken(token)
+ JwtVerifier.verify(token)
```

## 11. 접기 / 펼치기 — `<details>` / `<summary>`

긴 추론·대안·상세 단계를 *접어두기*. JS 없이 순수 HTML.

<details>
  <summary><strong>분석 — 클릭으로 펼쳐 보기</strong></summary>

  AuthService 의 책임이 너무 많은 이유:

  1. JWT 검증과 세션 관리가 한 클래스에 결합되어 *변경 영향* 이 큼
  2. 단위 테스트가 *통합 테스트에 의존* 해서 실행 시간이 김
  3. 권한 정책이 *하드코딩* 되어 정책 변경 시 코드 수정 필요

</details>

<details open>
  <summary>이미 열린 상태 (open 속성)</summary>

  `<details open>` 으로 기본 펼침 상태 시작 가능.
</details>

## 12. 인라인 SVG 다이어그램

agent 의 *진짜 펜*. mermaid 같은 JS 의존 없음. flowchart · 모듈 맵 · swatch 등에 적합.

<figure>
<svg viewBox="0 0 320 120" width="320" height="120">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#1f2937"/>
    </marker>
  </defs>
  <rect x="20" y="35" width="90" height="50" fill="#dbeafe" stroke="#2563eb" stroke-width="2" rx="4"/>
  <rect x="210" y="35" width="90" height="50" fill="#fef3c7" stroke="#f59e0b" stroke-width="2" rx="4"/>
  <line x1="110" y1="60" x2="210" y2="60" stroke="#1f2937" stroke-width="2" marker-end="url(#arr)"/>
  <text x="65" y="65" font-size="13" text-anchor="middle">AuthService</text>
  <text x="255" y="60" font-size="13" text-anchor="middle">JwtVerifier</text>
  <text x="255" y="78" font-size="11" text-anchor="middle" fill="#666">+ SessionStore</text>
  <text x="160" y="50" font-size="11" text-anchor="middle" fill="#666">extract</text>
</svg>
<figcaption>AuthService → JwtVerifier · SessionStore 책임 분리</figcaption>
</figure>

## 13. CSS-only 탭 (JS 없음)

`<input type="radio">` + `<label>` + CSS `:checked` 트릭. 순수 HTML/CSS.

<style>
.css-tabs { display: flex; gap: 4px; margin: 0.5em 0; }
.css-tabs > input[type=radio] { display: none; }
.css-tabs > label {
  padding: 6px 14px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  background: white;
}
.css-tabs > input[type=radio]:checked + label {
  background: #2563eb;
  color: white;
  border-color: #2563eb;
}
</style>

<div class="css-tabs">
  <input type="radio" id="tab-a" name="demo-tabs" checked />
  <label for="tab-a">탭 A</label>
  <input type="radio" id="tab-b" name="demo-tabs" />
  <label for="tab-b">탭 B</label>
  <input type="radio" id="tab-c" name="demo-tabs" />
  <label for="tab-c">탭 C</label>
</div>

## 14. iframe sandbox — JS 격리 실행 영역

agent 가 만든 *동적* 인터랙티브 (drag-drop / slider 반응 / live re-render / chart) 를 sandbox 안에서 격리 실행. host (htmlreview) 의 DOM · 세션 · 코멘트에 접근 불가.

<iframe sandbox="allow-scripts" width="100%" height="200" srcdoc='<!DOCTYPE html><html><head><style>body{font-family:-apple-system,sans-serif;padding:20px;margin:0;background:#f9fafb}button{padding:8px 14px;cursor:pointer;border:1px solid #d1d5db;border-radius:6px;background:white;font-size:14px}.count{font-size:32px;font-weight:600;color:#2563eb;margin-left:16px;vertical-align:middle}.note{margin-top:16px;font-size:12px;color:#6b7280}</style></head><body><p>JS 가 sandbox 안에서 격리 실행됩니다:</p><button onclick="var e=document.getElementById(&apos;c&apos;);e.textContent=(+e.textContent)+1">증가</button><span class="count" id="c">0</span><div class="note">이 iframe 의 JS 는 부모 페이지 접근 불가 — <code>sandbox=&quot;allow-scripts&quot;</code></div></body></html>'></iframe>

> 코멘트는 iframe 의 figure wrap 영역 단위로 매칭됨. 안 DOM 의 텍스트는 selector 가 못 잡음 (cross-origin sandbox).

---

**팁** — 어떤 영역도 코멘트 대상이 됩니다:

- 한 글자 drag → TextQuoteSelector exact 길이 1
- 표 셀 클릭 → `<td>` 단위
- 표 외곽 padding → `<figure>` 전체
- 코드 블록 클릭 → `<pre>` 전체
- 이미지 첨부 → 버블 안 📎 / paste / drag-drop
