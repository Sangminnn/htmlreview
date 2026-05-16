// htmlreview — HTML 입력 sanitize (M6 + Phase 1/2 확장)
//
// 허용 정책:
// - 시맨틱 review 콘텐츠 + heading id (FragmentSelector 의 target)
// - JS 없는 정적 인터랙션: <details>/<summary>, <input type="radio|checkbox|range|text|number">, <label>, CSS-only tab/toggle
// - inline <svg> diagram (flowchart / 모듈 맵 / swatch)
// - inline <style> (scoped CSS animation / layout)
// - <iframe sandbox="allow-scripts" srcdoc="...">  — JS 격리 실행 영역 (Phase 2)
//
// 차단:
// - <script>, inline event handlers (onclick 등), javascript:/data: URL 스킴, <object>, <embed>
// - <iframe src=...> (외부 origin) — srcdoc 만 허용
// - <input type="file|password|hidden|submit|button|image"> 등 비-review 용도

import sanitizeHtml from "sanitize-html";

const SVG_TAGS = [
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "defs", "marker", "use", "title", "desc",
  "linearGradient", "radialGradient", "stop", "clipPath", "mask",
];

const SVG_ATTRS = [
  "d", "viewBox", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap", "stroke-linejoin",
  "transform", "transform-origin",
  "cx", "cy", "r", "rx", "ry",
  "x", "y", "x1", "y1", "x2", "y2",
  "width", "height", "points", "preserveAspectRatio", "xmlns",
  "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "spreadMethod",
  "marker-end", "marker-start", "marker-mid",
  "orient", "refX", "refY", "markerWidth", "markerHeight", "markerUnits",
  "text-anchor", "dominant-baseline", "font-size", "font-family", "font-weight",
  "opacity", "clip-path", "mask",
];

const ALLOWED_INPUT_TYPES = new Set([
  "checkbox", "radio", "range", "text", "number",
]);

const SAFE_CSS_PROPERTIES = {
  color: [/.*/],
  background: [/.*/],
  "background-color": [/.*/],
  "background-image": [/.*/],
  border: [/.*/],
  "border-top": [/.*/],
  "border-bottom": [/.*/],
  "border-left": [/.*/],
  "border-right": [/.*/],
  "border-radius": [/.*/],
  padding: [/.*/],
  "padding-top": [/.*/],
  "padding-bottom": [/.*/],
  "padding-left": [/.*/],
  "padding-right": [/.*/],
  margin: [/.*/],
  "margin-top": [/.*/],
  "margin-bottom": [/.*/],
  "margin-left": [/.*/],
  "margin-right": [/.*/],
  display: [/.*/],
  "flex-direction": [/.*/],
  "justify-content": [/.*/],
  "align-items": [/.*/],
  gap: [/.*/],
  "grid-template-columns": [/.*/],
  "grid-template-rows": [/.*/],
  "grid-column": [/.*/],
  "grid-row": [/.*/],
  width: [/.*/],
  height: [/.*/],
  "max-width": [/.*/],
  "max-height": [/.*/],
  "min-width": [/.*/],
  "min-height": [/.*/],
  "text-align": [/.*/],
  "font-weight": [/.*/],
  "font-size": [/.*/],
  "font-family": [/.*/],
  "line-height": [/.*/],
  "letter-spacing": [/.*/],
  transform: [/.*/],
  transition: [/.*/],
  animation: [/.*/],
  opacity: [/.*/],
  fill: [/.*/],
  stroke: [/.*/],
  cursor: [/.*/],
  overflow: [/.*/],
  position: [/^(static|relative|absolute|sticky)$/], // fixed 제외 — review 페이지 위에 떠 있는 게 위험
  top: [/.*/],
  left: [/.*/],
  right: [/.*/],
  bottom: [/.*/],
  "z-index": [/.*/],
};

const svgAttrMap = SVG_TAGS.reduce((acc, tag) => {
  acc[tag] = SVG_ATTRS;
  return acc;
}, {});

export const SANITIZE_CONFIG = {
  allowedTags: [
    // semantic content
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "blockquote", "section", "article", "aside", "main", "header", "footer",
    "table", "thead", "tbody", "tr", "th", "td",
    "pre", "code", "kbd", "samp",
    "em", "strong", "b", "i", "u", "s", "del", "ins", "sub", "sup", "mark",
    "a", "span", "div", "figure", "figcaption", "img",
    // Phase 1 — static interactive
    "details", "summary",
    "input", "label",
    "style",
    // Phase 1 — inline SVG diagrams
    ...SVG_TAGS,
    // Phase 2 — sandboxed JS region
    "iframe",
  ],
  allowedAttributes: {
    "*": ["id", "class", "title", "lang", "dir", "style", "role", "aria-label", "aria-labelledby", "aria-hidden"],
    a: ["href", "name", "rel", "target"],
    img: ["src", "alt", "width", "height"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
    // Phase 1
    details: ["open"],
    input: ["type", "name", "value", "id", "checked", "disabled", "readonly", "min", "max", "step", "placeholder"],
    label: ["for"],
    // Phase 2
    iframe: ["sandbox", "srcdoc", "width", "height", "title", "loading", "referrerpolicy", "allow"],
    // SVG
    ...svgAttrMap,
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedStyles: { "*": SAFE_CSS_PROPERTIES },
  transformTags: {
    iframe: (tagName, attribs) => {
      // sandbox 강제 — allow-scripts 만 default. allow-same-origin 은 차단 (XSS 위험)
      const sandbox = (attribs.sandbox || "allow-scripts")
        .split(/\s+/)
        .filter((t) => t && t !== "allow-same-origin" && t !== "allow-top-navigation")
        .join(" ") || "allow-scripts";
      const next = { ...attribs, sandbox };
      // src 는 제거 — srcdoc 만 허용 (외부 origin 차단)
      delete next.src;
      return { tagName, attribs: next };
    },
    input: (tagName, attribs) => {
      const type = (attribs.type || "text").toLowerCase();
      if (!ALLOWED_INPUT_TYPES.has(type)) {
        return { tagName: "span", attribs: {}, text: "" };
      }
      return { tagName, attribs: { ...attribs, type } };
    },
  },
  // <style> 태그 안 CSS 도 그대로 보존 (sanitize-html 기본은 style 태그 제거).
  // allowedTags 에 "style" 있으면 보존됨.
  parser: {
    // SVG 의 카멜케이스 속성 (viewBox, preserveAspectRatio, gradientUnits 등) 을
    // lowercase 로 변환하면 브라우저가 SVG 렌더를 제대로 못 함 → 보존
    lowerCaseAttributeNames: false,
  },
};

export const sanitizeHtmlInput = (html) => sanitizeHtml(html, SANITIZE_CONFIG);
