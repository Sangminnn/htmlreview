// htmlreview — markdown -> 시맨틱 HTML (Node 환경)
//
// design.md §5.1 따라:
// - marked.lexer/parser 그대로 활용
// - heading 마다 안정적 id slug 부여 (FragmentSelector 의 target)
// - data-block-id / data-anchor 등 v1 의 위치 의존 식별자 부착 안 함
// - 결과는 시맨틱 태그(<section>·<h*>·<p>·<ul>·<li>·<table>·<pre>·<figure>)만 사용

import { Marked } from "marked";

const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const stripTags = (html) => html.replace(/<[^>]+>/g, "");

export const renderMarkdownToHtml = (markdown) => {
  const seenIds = new Map();
  const ensureUniqueId = (base) => {
    const key = base || "section";
    const n = seenIds.get(key) ?? 0;
    seenIds.set(key, n + 1);
    return n === 0 ? key : `${key}-${n + 1}`;
  };

  const renderer = {
    heading({ tokens, depth }) {
      const inner = this.parser.parseInline(tokens);
      const id = ensureUniqueId(slugify(stripTags(inner)));
      return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
    },
  };

  const m = new Marked({ renderer });
  let html = m.parse(markdown);
  // 외곽 hit 영역 확보 — table / pre / iframe 을 figure 로 wrap (BLOCK_SELECTOR 의 figure 가 잡음)
  html = html
    .replace(/<table>/g, '<figure class="md-table-wrap"><table>')
    .replace(/<\/table>/g, "</table></figure>")
    .replace(/<pre>/g, '<figure class="md-pre-wrap"><pre>')
    .replace(/<\/pre>/g, "</pre></figure>")
    .replace(/<iframe(\s|>)/g, '<figure class="md-iframe-wrap"><iframe$1')
    .replace(/<\/iframe>/g, "</iframe></figure>");
  return html;
};
