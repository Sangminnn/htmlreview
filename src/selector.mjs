// htmlreview — DOM Range <-> W3C Selector 변환 (브라우저 환경 가정)
//
// dom-anchor-text-quote 위 얇은 wrapper. fromRange/toRange 의 결과를
// W3C Annotation Data Model 호환 selector 객체로 정규화한다.
//
// 현재 단일 TextQuoteSelector 만 emit. RangeSelector / FragmentSelector
// 등은 후속 마일스톤에서 추가.

import { fromRange, toRange } from "dom-anchor-text-quote";

const cleanQuote = (tq) => {
  if (!tq || typeof tq.exact !== "string" || tq.exact.length === 0) return null;
  const selector = { type: "TextQuoteSelector", exact: tq.exact };
  if (tq.prefix) selector.prefix = tq.prefix;
  if (tq.suffix) selector.suffix = tq.suffix;
  return selector;
};

export const createSelector = (rootElement, range) => {
  if (!rootElement || !range || range.collapsed) return null;
  const tq = fromRange(rootElement, range);
  return cleanQuote(tq);
};

export const resolveSelector = (rootElement, selector, options = {}) => {
  if (!rootElement || !selector) return null;
  if (selector.type !== "TextQuoteSelector") return null;
  return toRange(rootElement, selector, options);
};
