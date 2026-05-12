// htmlreview — minimal viable client (M3)
//
// 단일 Selector 모델: 사용자가 텍스트를 선택하면 createSelector(W3C
// TextQuoteSelector)를 만들고, 코멘트 본문과 함께 /submit 로 POST 한다.
// 서버가 W3C Annotation envelope 으로 감싸 stdout 으로 출력.

import { createSelector, resolveSelector } from "../../src/selector.mjs";

const annotations = new Map(); // key -> { selector, comment }
let activeBubble = null;
let rangeToolbar = null;

const docEl = document.getElementById("doc");
const submitBtn = document.getElementById("submit-btn");
const countEl = document.getElementById("comment-count");

const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const updateCount = () => {
  const n = annotations.size;
  countEl.textContent = n === 0 ? "코멘트 없음" : `코멘트 ${n}`;
};

const closeBubble = () => {
  if (activeBubble) {
    activeBubble.remove();
    activeBubble = null;
  }
};

const closeToolbar = () => {
  if (rangeToolbar) {
    rangeToolbar.remove();
    rangeToolbar = null;
  }
};

const showToolbar = (range) => {
  closeToolbar();
  const rect = range.getBoundingClientRect();
  const bar = document.createElement("div");
  bar.className = "range-toolbar";
  bar.innerHTML = `<button type="button">코멘트 추가</button>`;
  bar.style.position = "fixed";
  bar.style.top = `${Math.max(rect.top - 36, 4)}px`;
  bar.style.left = `${rect.left}px`;
  document.body.appendChild(bar);
  rangeToolbar = bar;
  bar.querySelector("button").addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openBubbleForRange(range);
  });
};

const showBubble = (key, anchorRect, existing) => {
  closeBubble();
  closeToolbar();
  const bubble = document.createElement("div");
  bubble.className = "comment-bubble";
  const deleteBtn = existing ? `<button type="button" class="btn-delete">삭제</button>` : "";
  bubble.innerHTML = `
    <textarea placeholder="코멘트… (⌘↵ 저장 · esc 닫기)"></textarea>
    <div class="actions">
      ${deleteBtn}
      <button type="button" class="btn-cancel">닫기</button>
      <button type="button" class="btn-save">저장</button>
    </div>
  `;
  bubble.style.position = "fixed";
  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 200);
  const left = Math.min(anchorRect.left, window.innerWidth - 340);
  bubble.style.top = `${Math.max(4, top)}px`;
  bubble.style.left = `${Math.max(4, left)}px`;
  document.body.appendChild(bubble);
  activeBubble = bubble;

  const ta = bubble.querySelector("textarea");
  if (existing?.comment) ta.value = existing.comment;
  requestAnimationFrame(() => ta.focus());

  bubble.querySelector(".btn-save").addEventListener("click", () => {
    const text = ta.value.trim();
    if (!text) return;
    saveAnnotation(key, text);
    closeBubble();
  });
  bubble.querySelector(".btn-cancel").addEventListener("click", closeBubble);
  bubble.querySelector(".btn-delete")?.addEventListener("click", () => {
    deleteAnnotation(key);
    closeBubble();
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeBubble();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      bubble.querySelector(".btn-save").click();
    }
  });
};

const openBubbleForRange = (range) => {
  const selector = createSelector(docEl, range);
  if (!selector) return;
  const key = newKey();
  annotations.set(key, { selector, comment: "", _pending: true });
  showBubble(key, range.getBoundingClientRect(), null);
  window.getSelection()?.removeAllRanges();
};

const saveAnnotation = (key, comment) => {
  const ann = annotations.get(key);
  if (!ann) return;
  ann.comment = comment;
  delete ann._pending;
  highlightAnnotation(key);
  updateCount();
};

const deleteAnnotation = (key) => {
  removeHighlight(key);
  annotations.delete(key);
  updateCount();
};

const highlightAnnotation = (key) => {
  removeHighlight(key);
  const ann = annotations.get(key);
  if (!ann) return;
  const range = resolveSelector(docEl, ann.selector);
  if (!range) return;
  try {
    const mark = document.createElement("mark");
    mark.className = "anno-mark";
    mark.dataset.annoKey = key;
    range.surroundContents(mark);
    mark.addEventListener("click", (e) => {
      e.stopPropagation();
      showBubble(key, mark.getBoundingClientRect(), ann);
    });
  } catch {
    // surroundContents fails on partial-node / cross-node ranges → skip highlight,
    // annotation is still saved and submitted (just not visually marked).
  }
};

const removeHighlight = (key) => {
  const mark = document.querySelector(`mark.anno-mark[data-anno-key="${CSS.escape(key)}"]`);
  if (!mark) return;
  const parent = mark.parentNode;
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
  parent.removeChild(mark);
  parent.normalize();
};

document.addEventListener("mouseup", () => {
  setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return closeToolbar();
    const range = sel.getRangeAt(0);
    if (range.collapsed) return closeToolbar();
    if (!sel.toString().trim()) return closeToolbar();
    if (!docEl.contains(range.commonAncestorContainer)) return closeToolbar();
    showToolbar(range);
  }, 10);
});

document.addEventListener("click", (e) => {
  if (e.target.closest(".comment-bubble")) return;
  if (e.target.closest(".range-toolbar")) return;
  if (e.target.closest("mark.anno-mark")) return;
  closeBubble();
  closeToolbar();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeBubble();
    closeToolbar();
  }
});

submitBtn.addEventListener("click", async () => {
  const items = [];
  for (const ann of annotations.values()) {
    if (ann._pending || !ann.comment) continue;
    items.push({ selector: ann.selector, comment: ann.comment });
  }
  const status = items.length === 0 ? "approved" : "revision_requested";
  try {
    await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, items }),
    });
  } catch (err) {
    console.error("submit failed", err);
  }
  window.close();
  setTimeout(() => {
    document.body.innerHTML = "";
  }, 100);
});

updateCount();

// ───── revision-report — 직전 라운드 코멘트 사이드바 + 본문 뱃지 ─────

const escapeText = (s) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const readRevisionReport = () => {
  const tag = document.getElementById("revision-data");
  if (!tag) return null;
  try {
    const parsed = JSON.parse(tag.textContent || "null");
    if (!parsed || !Array.isArray(parsed.rounds) || parsed.rounds.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
};

const renderRevisionCard = (item, idx, onClick) => {
  const card = document.createElement("article");
  card.className = "revision-card";
  card.dataset.idx = String(idx);
  const body = Array.isArray(item.body) ? item.body : [];
  const comment = body.find((b) => b?.purpose === "commenting")?.value || "";
  const resolution = body.find((b) => b?.purpose === "describing")?.value || "";
  const quote = item?.target?.selector?.exact || "";
  card.innerHTML = `
    ${quote ? `<div class="revision-card-quote">${escapeText(quote)}</div>` : ""}
    <div class="revision-card-section">
      <div class="revision-card-label">코멘트</div>
      <div class="revision-card-text">${comment ? escapeText(comment) : "<em>(없음)</em>"}</div>
    </div>
    <div class="revision-card-section">
      <div class="revision-card-label">반영</div>
      <div class="revision-card-text">${resolution ? escapeText(resolution) : "<em>(없음)</em>"}</div>
    </div>
  `;
  card.addEventListener("click", onClick);
  return card;
};

const renderRevisionMark = (item, idx, onClick) => {
  const range = resolveSelector(docEl, item?.target?.selector);
  if (!range) return null;
  const mark = document.createElement("button");
  mark.type = "button";
  mark.className = "revision-mark";
  mark.dataset.idx = String(idx);
  mark.textContent = "변경됨";
  mark.setAttribute("aria-label", "변경된 위치 — 코멘트 보기");
  try {
    const insertion = range.cloneRange();
    insertion.collapse(true);
    insertion.insertNode(mark);
  } catch {
    return null;
  }
  mark.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return mark;
};

const activateCard = (card, allCards) => {
  allCards.forEach((c) => c.classList.remove("is-active"));
  card.classList.add("is-active");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
};

const flashMark = (mark) => {
  mark.classList.remove("flash");
  void mark.offsetWidth;
  mark.classList.add("flash");
  mark.scrollIntoView({ behavior: "smooth", block: "center" });
};

const renderRevisionReport = (report) => {
  const sidebar = document.getElementById("revision-sidebar");
  const bodyEl = document.getElementById("revision-body");
  if (!sidebar || !bodyEl) return;
  const latest = report.rounds[0];
  if (!latest || !Array.isArray(latest.items) || latest.items.length === 0) return;

  sidebar.hidden = false;
  document.body.classList.add("has-revision");

  const cards = [];
  const marks = [];

  // 1) 카드 먼저 만들기 — 마크 삽입이 본문 textContent 를 바꾸기 전에 selector resolve 가 안정
  latest.items.forEach((item, idx) => {
    const card = renderRevisionCard(item, idx, () => {
      const mark = marks[idx];
      if (mark) flashMark(mark);
    });
    bodyEl.appendChild(card);
    cards.push(card);
  });

  // 2) 마크는 본문에 차례로 삽입 — 각 item.target.selector 를 resolveSelector 로 위치 찾음
  latest.items.forEach((item, idx) => {
    const card = cards[idx];
    const mark = renderRevisionMark(item, idx, () => activateCard(card, cards));
    marks.push(mark);
  });
};

const revisionReport = readRevisionReport();
if (revisionReport) renderRevisionReport(revisionReport);
