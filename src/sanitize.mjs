// htmlreview — HTML 입력 sanitize (M6)
//
// 허용 태그/속성은 시맨틱 review 콘텐츠 + heading id (FragmentSelector 의 target)
// 기준. script / inline event handler / javascript: URL / iframe / object / embed
// 등 위험 요소는 모두 제거.

import sanitizeHtml from "sanitize-html";

export const SANITIZE_CONFIG = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr",
    "ul", "ol", "li",
    "blockquote", "section", "article", "aside", "main", "header", "footer",
    "table", "thead", "tbody", "tr", "th", "td",
    "pre", "code", "kbd", "samp",
    "em", "strong", "b", "i", "u", "s", "del", "ins", "sub", "sup", "mark",
    "a", "span", "div", "figure", "figcaption", "img",
  ],
  allowedAttributes: {
    "*": ["id", "class", "title", "lang", "dir"],
    a: ["href", "name", "rel", "target"],
    img: ["src", "alt", "width", "height"],
    th: ["colspan", "rowspan", "scope"],
    td: ["colspan", "rowspan"],
  },
  allowedSchemes: ["http", "https", "mailto"],
};

export const sanitizeHtmlInput = (html) => sanitizeHtml(html, SANITIZE_CONFIG);
