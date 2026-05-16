// htmlreview — client (M3+, mdreview 풀 패리티)
//
// 단일 Selector 모델 위에 mdreview 의 UX 패턴 재구현:
// - block hover affordance (background color)
// - block click → 바로 bubble (toolbar 생략)
// - drag selection → toolbar → bubble
// - draft / promote / saved 상태 (textarea blur 시 임시저장, 저장 버튼은 commit)
// - block-overlay (range.getClientRects 별 absolute box, cross-node OK)
// - comment-count button → popover 리스트, item click → jump + reopen
// - revision-report 사이드바 + 본문 "변경됨" 뱃지 (M5 그대로)

import { createSelector, resolveSelector } from "../../src/selector.mjs";

// ──────────── State ────────────
const annotations = new Map();      // key -> { selector, comment }   (commit 됨; comment === "" 면 pending)
const drafts = new Map();           // key -> { selector, text }      (임시 저장)
const overlayElements = new Map();  // key -> HTMLDivElement[]
let activeBubble = null;
let rangeToolbar = null;
let commentListPopover = null;
let hoveredBlock = null;
let pulseTimer = null;

// ──────────── Refs ────────────
const docEl = document.getElementById("doc");
const submitBtn = document.getElementById("submit-btn");
const countEl = document.getElementById("comment-count");

// ──────────── Helpers ────────────
const newKey = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const escapeHtml = (s) =>
  (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── multimodal — 이미지 첨부 헬퍼 ──
const MAX_IMAGES = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const sameImages = (a, b) => {
  const aa = a || [];
  const bb = b || [];
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
};

const BLOCK_SELECTOR =
  "p, li, td, th, tr, h1, h2, h3, h4, h5, h6, blockquote, figcaption, ul, ol, table, section, article, figure";

const anchorFromRange = (range) => {
  const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  return startEl?.closest(BLOCK_SELECTOR) || docEl;
};

const committedAnnotations = () =>
  [...annotations].filter(([, a]) =>
    (a.comment && a.comment.trim().length > 0) || (Array.isArray(a.images) && a.images.length > 0),
  );

const updateCount = () => {
  const commentCount = committedAnnotations().length;
  const draftCount = drafts.size;
  const total = commentCount + draftCount;
  countEl.textContent = draftCount > 0
    ? `코멘트 ${commentCount} · 임시 ${draftCount}`
    : commentCount === 0 ? "코멘트 없음" : `코멘트 ${commentCount}`;
  countEl.disabled = total === 0;
  if (commentListPopover) renderCommentList(commentListPopover);
};

// ──────────── Toolbar ────────────
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

// ──────────── Bubble ────────────
const closeBubble = () => {
  if (activeBubble) {
    if (activeBubble._cleanup) activeBubble._cleanup();
    activeBubble.remove();
    activeBubble = null;
  }
};

const pinBubbleToBlock = (bubble, anchorEl) => {
  bubble.style.position = "fixed";
  const sidePadding = 16;
  const viewportPadding = 16;
  const verticalGap = 8;
  const minBubbleWidth = 280;
  const maxBubbleWidth = 360;

  const update = () => {
    const docRect = docEl.getBoundingClientRect();
    const blockRect = anchorEl.getBoundingClientRect();
    const rightSpace = window.innerWidth - docRect.right - sidePadding - viewportPadding;
    const fitsOnRight = rightSpace >= minBubbleWidth;

    if (fitsOnRight) {
      const width = Math.min(maxBubbleWidth, Math.floor(rightSpace));
      bubble.style.width = `${width}px`;
      const bubbleHeight = bubble.offsetHeight || 0;
      let top = blockRect.top;
      const maxTop = window.innerHeight - bubbleHeight - viewportPadding;
      if (top > maxTop) top = maxTop;
      if (top < viewportPadding) top = viewportPadding;
      bubble.style.left = `${docRect.right + sidePadding}px`;
      bubble.style.top = `${top}px`;
      return;
    }

    bubble.style.width = "";
    const width = bubble.offsetWidth || 320;
    const bubbleHeight = bubble.offsetHeight || 0;
    let left = blockRect.left;
    if (left + width > window.innerWidth - viewportPadding) {
      left = window.innerWidth - width - viewportPadding;
    }
    if (left < viewportPadding) left = viewportPadding;
    let top = blockRect.bottom + verticalGap;
    if (top + bubbleHeight > window.innerHeight - viewportPadding) {
      const above = blockRect.top - bubbleHeight - verticalGap;
      if (above >= viewportPadding) top = above;
      else top = Math.max(viewportPadding, window.innerHeight - bubbleHeight - viewportPadding);
    }
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  };

  update();

  let rafPending = false;
  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      update();
    });
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  const ro = new ResizeObserver(schedule);
  ro.observe(bubble);
  ro.observe(document.body);

  bubble._cleanup = () => {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    ro.disconnect();
  };
};

const showBubble = (key, anchorEl) => {
  closeBubble();
  closeToolbar();

  const ann = annotations.get(key);
  const draft = drafts.get(key);
  const hasCommitted = !!(ann && ((ann.comment && ann.comment.trim()) || (ann.images && ann.images.length)));
  const initialText = ann?.comment || draft?.text || "";
  const initialImages = [...(ann?.images || draft?.images || [])];
  const initialState = hasCommitted ? "saved" : draft ? "draft" : "empty";
  const deleteVisible = hasCommitted || !!draft;

  let images = initialImages;

  const bubble = document.createElement("div");
  bubble.className = "comment-bubble";
  const deleteBtn = deleteVisible ? `<button type="button" class="btn-delete">삭제</button>` : "";

  bubble.innerHTML = `
    <textarea placeholder="코멘트… (⌘↵ 저장 · esc 닫기 · 이미지는 붙여넣기·드래그·첨부)"></textarea>
    <div class="attachments"></div>
    <input type="file" class="file-input" accept="image/png,image/jpeg,image/gif,image/webp" multiple>
    <div class="actions">
      <button type="button" class="btn-attach" title="이미지 첨부">📎</button>
      <span class="bubble-status" data-state="${initialState}">${stateText(initialState)}</span>
      ${deleteBtn}
      <button type="button" class="btn-cancel">닫기</button>
      <button type="button" class="btn-save">저장</button>
    </div>
  `;
  document.body.appendChild(bubble);
  activeBubble = bubble;
  pinBubbleToBlock(bubble, anchorEl);

  const ta = bubble.querySelector("textarea");
  const statusEl = bubble.querySelector(".bubble-status");
  const attachmentsEl = bubble.querySelector(".attachments");
  const fileInput = bubble.querySelector(".file-input");
  const attachBtn = bubble.querySelector(".btn-attach");

  ta.value = initialText;
  requestAnimationFrame(() => {
    if (activeBubble !== bubble) return;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });

  const setStatus = (state) => {
    statusEl.dataset.state = state;
    statusEl.textContent = stateText(state);
  };

  const refreshStatus = () => {
    const trimmed = ta.value.trim();
    const current = annotations.get(key);
    if (!trimmed && images.length === 0) return setStatus("empty");
    const sameText = trimmed === (current?.comment ?? "");
    const sameImg = sameImages(images, current?.images);
    setStatus(sameText && sameImg && current ? "saved" : "draft");
  };

  const renderThumbs = () => {
    attachmentsEl.innerHTML = images.map((src, idx) => `
      <div class="thumb">
        <img src="${escapeHtml(src)}" alt="첨부 ${idx + 1}">
        <button type="button" class="thumb-remove" data-idx="${idx}" aria-label="삭제">×</button>
      </div>
    `).join("");
    attachmentsEl.querySelectorAll(".thumb-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.dataset.idx);
        images.splice(idx, 1);
        renderThumbs();
        refreshStatus();
      });
    });
  };

  renderThumbs();

  const addImageFile = async (file) => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      alert(`지원하지 않는 형식: ${file.type || "(unknown)"}\n허용: PNG · JPEG · GIF · WEBP`);
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`파일이 큽니다 (${(file.size / 1024 / 1024).toFixed(1)}MB).\n최대 5MB.`);
      return;
    }
    if (images.length >= MAX_IMAGES) {
      alert(`이미지는 최대 ${MAX_IMAGES}장.`);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      if (typeof dataUrl !== "string") return;
      images.push(dataUrl);
      renderThumbs();
      refreshStatus();
    } catch (err) {
      console.error("read image failed", err);
    }
  };

  const addImagesFromFileList = async (fileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    for (const file of files) {
      if (images.length >= MAX_IMAGES) {
        alert(`이미지는 최대 ${MAX_IMAGES}장.`);
        break;
      }
      await addImageFile(file);
    }
  };

  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    await addImagesFromFileList(fileInput.files);
    fileInput.value = "";
  });

  bubble.addEventListener("paste", async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems = Array.from(items).filter((it) => it.kind === "file" && it.type.startsWith("image/"));
    if (imageItems.length === 0) return;
    e.preventDefault();
    for (const it of imageItems) {
      if (images.length >= MAX_IMAGES) break;
      const file = it.getAsFile();
      if (file) await addImageFile(file);
    }
  });

  bubble.addEventListener("dragover", (e) => {
    if (!e.dataTransfer) return;
    const hasFile = Array.from(e.dataTransfer.items || []).some((it) => it.kind === "file");
    if (!hasFile) return;
    e.preventDefault();
    bubble.classList.add("dragging-over");
  });
  bubble.addEventListener("dragleave", (e) => {
    if (e.target === bubble) bubble.classList.remove("dragging-over");
  });
  bubble.addEventListener("drop", async (e) => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault();
    bubble.classList.remove("dragging-over");
    await addImagesFromFileList(e.dataTransfer.files);
  });

  ta.addEventListener("input", refreshStatus);

  const persistDraft = () => {
    const text = ta.value.trim();
    const current = annotations.get(key);
    if (!text && images.length === 0) {
      if (drafts.delete(key)) {
        updateCount();
        renderAllOverlays();
      }
      return;
    }
    if (current && text === (current.comment ?? "") && sameImages(images, current.images)) {
      if (drafts.delete(key)) {
        updateCount();
        renderAllOverlays();
      }
      return;
    }
    const selector = current?.selector || drafts.get(key)?.selector;
    if (!selector) return;
    drafts.set(key, { selector, text, images: [...images] });
    updateCount();
    renderAllOverlays();
  };

  const promote = () => {
    const text = ta.value.trim();
    if (!text && images.length === 0) {
      ta.focus();
      return;
    }
    const current = annotations.get(key);
    const selector = current?.selector || drafts.get(key)?.selector;
    if (!selector) return;
    annotations.set(key, { selector, comment: text, images: [...images] });
    drafts.delete(key);
    updateCount();
    renderAllOverlays();
    closeBubble();
  };

  ta.addEventListener("blur", persistDraft);

  bubble.querySelector(".btn-save").addEventListener("click", promote);
  bubble.querySelector(".btn-cancel").addEventListener("click", () => {
    persistDraft();
    closeBubble();
  });
  bubble.querySelector(".btn-delete")?.addEventListener("click", () => {
    annotations.delete(key);
    drafts.delete(key);
    updateCount();
    renderAllOverlays();
    closeBubble();
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      persistDraft();
      closeBubble();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      promote();
    }
  });
};

const stateText = (state) =>
  state === "saved" ? "저장됨" : state === "draft" ? "임시저장됨" : "";

// ──────────── Annotation flow ────────────
const openBubbleForRange = (range) => {
  const selector = createSelector(docEl, range);
  if (!selector) return;
  const key = newKey();
  annotations.set(key, { selector, comment: "" }); // 빈 entry — 저장 / 임시저장 시 확정
  const anchor = anchorFromRange(range);
  showBubble(key, anchor);
  window.getSelection()?.removeAllRanges();
};

const reopenBubbleForKey = (key) => {
  const entry = annotations.get(key) || drafts.get(key);
  if (!entry) return;
  const range = resolveSelector(docEl, entry.selector);
  if (!range) return;
  const anchor = anchorFromRange(range);
  showBubble(key, anchor);
};

// ──────────── Block class (.has-comment / .has-draft on element itself) ────────────
const blockClassMap = new Map(); // element -> Set<key>

const findIntersectingBlocks = (range) => {
  const candidates = docEl.querySelectorAll(BLOCK_SELECTOR);
  const hits = [];
  for (const b of candidates) {
    try { if (range.intersectsNode(b)) hits.push(b); } catch {}
  }
  // range 가 element 의 전체 textContent 를 cover 하는지 — "block 단위 선택" 시그널
  const fullyContained = hits.filter((el) => {
    try {
      const er = document.createRange();
      er.selectNodeContents(el);
      return range.compareBoundaryPoints(Range.START_TO_START, er) <= 0
        && range.compareBoundaryPoints(Range.END_TO_END, er) >= 0;
    } catch {
      return false;
    }
  });
  if (fullyContained.length > 0) {
    // 전체 cover 되는 element 들 중 가장 바깥만 — table click 같은 컨테이너 선택 케이스
    return fullyContained.filter((el) => !fullyContained.some((other) => other !== el && other.contains(el)));
  }
  // 부분 매칭이면 가장 안쪽 element 만 — drag selection / inline 선택 케이스
  return hits.filter((el) => !hits.some((other) => other !== el && el.contains(other)));
};

const applyBlockClassForKey = (key) => {
  const entry = annotations.get(key) || drafts.get(key);
  if (!entry) return;
  const range = resolveSelector(docEl, entry.selector);
  if (!range) return;
  const blocks = findIntersectingBlocks(range);
  blocks.forEach((el) => {
    const set = blockClassMap.get(el) || new Set();
    set.add(key);
    blockClassMap.set(el, set);
  });
};

const reconcileBlockClasses = () => {
  for (const [el, keys] of [...blockClassMap]) {
    if (keys.size === 0) {
      el.classList.remove("has-comment", "has-draft", "is-flash");
      delete el.dataset.commentKey;
      blockClassMap.delete(el);
      continue;
    }
    const committedKey = [...keys].find((k) => {
      const ann = annotations.get(k);
      return ann && ann.comment && ann.comment.trim();
    });
    const hasCommitted = !!committedKey;
    el.classList.toggle("has-comment", hasCommitted);
    el.classList.toggle("has-draft", !hasCommitted);
    el.dataset.commentKey = committedKey || [...keys][0];
  }
};

const clearAllBlockClasses = () => {
  for (const [el] of blockClassMap) {
    el.classList.remove("has-comment", "has-draft", "is-flash");
    delete el.dataset.commentKey;
  }
  blockClassMap.clear();
};

const renderAllOverlays = () => {
  clearAllBlockClasses();
  for (const [key, ann] of annotations) {
    if (ann.comment && ann.comment.trim()) applyBlockClassForKey(key);
  }
  for (const [key] of drafts) {
    const ann = annotations.get(key);
    if (!ann || !ann.comment || !ann.comment.trim()) applyBlockClassForKey(key);
  }
  reconcileBlockClasses();
};

let renderRafPending = false;
const scheduleOverlayRefresh = () => {
  if (renderRafPending) return;
  renderRafPending = true;
  requestAnimationFrame(() => {
    renderRafPending = false;
    renderAllOverlays();
  });
};

window.addEventListener("resize", scheduleOverlayRefresh);

// ──────────── Comment-list popover ────────────
const truncateQuote = (s, max = 40) => {
  const normalized = (s || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max) + "…";
};

const renderCommentList = (popover) => {
  const body = popover.querySelector(".comment-list-body");
  const items = [
    ...committedAnnotations().map(([key, a]) => ({ key, text: a.comment, isDraft: false, selector: a.selector })),
    ...[...drafts].map(([key, d]) => ({ key, text: d.text, isDraft: true, selector: d.selector })),
  ];
  if (items.length === 0) {
    body.innerHTML = `<div class="comment-list-empty">아직 코멘트가 없습니다</div>`;
    return;
  }
  body.innerHTML = items.map(({ key, text, isDraft, selector }) => {
    const tag = isDraft ? `<span class="comment-list-tag is-draft">임시</span>` : "";
    const quote = truncateQuote(selector?.exact);
    const quoteHtml = quote ? `<div class="comment-list-quote">${escapeHtml(quote)}</div>` : "";
    return `
      <button type="button" class="comment-list-item${isDraft ? " is-draft" : ""}" data-key="${escapeHtml(key)}">
        ${quoteHtml}
        <div class="comment-list-body-line">${tag}<span class="comment-list-text">${escapeHtml(text || "(빈)")}</span></div>
      </button>
    `;
  }).join("");
  body.querySelectorAll(".comment-list-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      closeCommentList();
      jumpToEntry(key);
    });
  });
};

const positionCommentList = (popover) => {
  const triggerRect = countEl.getBoundingClientRect();
  const padding = 8;
  const gap = 6;
  const w = popover.offsetWidth || 320;
  let left = triggerRect.right - w;
  if (left < padding) left = padding;
  if (left + w > window.innerWidth - padding) left = window.innerWidth - w - padding;
  let top = triggerRect.bottom + gap;
  const h = popover.offsetHeight || 0;
  if (top + h > window.innerHeight - padding) {
    top = Math.max(padding, window.innerHeight - h - padding);
  }
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
};

const openCommentList = () => {
  if (commentListPopover) return;
  if (committedAnnotations().length === 0 && drafts.size === 0) return;
  closeBubble();
  closeToolbar();
  const popover = document.createElement("div");
  popover.className = "comment-list-popover";
  popover.innerHTML = `
    <div class="comment-list-header">코멘트</div>
    <div class="comment-list-body"></div>
  `;
  popover.style.position = "fixed";
  popover.style.visibility = "hidden";
  document.body.appendChild(popover);
  commentListPopover = popover;
  renderCommentList(popover);
  positionCommentList(popover);
  popover.style.visibility = "";
  countEl.setAttribute("aria-expanded", "true");
  window.addEventListener("scroll", positionPopoverOnScroll, { passive: true });
  window.addEventListener("resize", positionPopoverOnScroll);
};

const positionPopoverOnScroll = () => {
  if (commentListPopover) positionCommentList(commentListPopover);
};

const closeCommentList = () => {
  if (!commentListPopover) return;
  commentListPopover.remove();
  commentListPopover = null;
  countEl.setAttribute("aria-expanded", "false");
  window.removeEventListener("scroll", positionPopoverOnScroll);
  window.removeEventListener("resize", positionPopoverOnScroll);
};

countEl.addEventListener("click", () => {
  if (countEl.disabled) return;
  if (commentListPopover) closeCommentList();
  else openCommentList();
});

// ──────────── Jump / Pulse ────────────
const jumpToEntry = (key) => {
  let firstEl = null;
  for (const [el, keys] of blockClassMap) {
    if (keys.has(key)) { firstEl = el; break; }
  }
  if (!firstEl) return;
  firstEl.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => {
    for (const [el, keys] of blockClassMap) {
      if (keys.has(key)) {
        el.classList.remove("is-flash");
        void el.offsetWidth;
        el.classList.add("is-flash");
      }
    }
    if (pulseTimer) clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => {
      for (const [el] of blockClassMap) el.classList.remove("is-flash");
      pulseTimer = null;
    }, 1200);
  }, 320);
  setTimeout(() => reopenBubbleForKey(key), 520);
};

// ──────────── Block hover / click ────────────
const setHoverBlock = (el) => {
  if (hoveredBlock === el) return;
  if (hoveredBlock) hoveredBlock.classList.remove("is-hover-block");
  hoveredBlock = el;
  if (el) el.classList.add("is-hover-block");
};

const shouldHover = (target) => {
  if (!docEl.contains(target)) return null;
  if (
    target.closest(".comment-bubble") ||
    target.closest(".range-toolbar") ||
    target.closest(".revision-sidebar") ||
    target.closest(".revision-mark") ||
    target.closest(".comment-list-popover")
  ) return null;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return null;
  const block = target.closest(BLOCK_SELECTOR);
  if (!block || !docEl.contains(block)) return null;
  // 이미 코멘트/임시저장 표시된 block 은 자체 background 가 있어 hover affordance 불필요
  if (block.classList.contains("has-comment") || block.classList.contains("has-draft")) return null;
  return block;
};

document.addEventListener("mouseover", (e) => {
  setHoverBlock(shouldHover(e.target));
});
docEl.addEventListener("mouseleave", () => setHoverBlock(null));

const tryBlockClick = (target) => {
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed && sel.toString().trim()) return false;
  if (!docEl.contains(target)) return false;
  if (
    target.closest(".block-overlay") ||
    target.closest(".revision-mark") ||
    target.closest(".revision-sidebar")
  ) return false;
  const block = target.closest(BLOCK_SELECTOR);
  if (!block || !docEl.contains(block)) return false;
  const range = document.createRange();
  range.selectNodeContents(block);
  if (!range.toString().trim()) return false;
  setHoverBlock(null);
  openBubbleForRange(range);
  return true;
};

document.addEventListener("click", (e) => {
  if (e.target.closest(".comment-bubble")) return;
  if (e.target.closest(".range-toolbar")) return;
  if (e.target.closest(".comment-list-popover")) return;
  if (e.target.closest("#comment-count")) return;
  if (e.target.closest(".revision-sidebar")) return;

  // 이미 코멘트/임시저장 표시된 block 클릭 → 그 bubble 재오픈
  const annotated = e.target.closest(".has-comment, .has-draft");
  if (annotated && annotated.dataset.commentKey) {
    e.stopPropagation();
    reopenBubbleForKey(annotated.dataset.commentKey);
    return;
  }

  if (commentListPopover) closeCommentList();
  if (tryBlockClick(e.target)) return;
  closeBubble();
  closeToolbar();
});

// ──────────── Drag selection → toolbar ────────────
document.addEventListener("mouseup", (e) => {
  if (e.target.closest(".comment-bubble")) return;
  if (e.target.closest(".range-toolbar")) return;
  if (e.target.closest(".comment-list-popover")) return;
  if (e.target.closest(".revision-sidebar")) return;
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

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeBubble();
    closeToolbar();
    closeCommentList();
  }
});

// ──────────── Submit ────────────
submitBtn.addEventListener("click", async () => {
  const items = committedAnnotations().map(([, a]) => ({
    selector: a.selector,
    comment: a.comment || "",
    ...(Array.isArray(a.images) && a.images.length > 0 ? { images: a.images } : {}),
  }));
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
  setTimeout(() => { document.body.innerHTML = ""; }, 100);
});

updateCount();

// ──────────── revision-report (M5) ────────────
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
    ${quote ? `<div class="revision-card-quote">${escapeHtml(quote)}</div>` : ""}
    <div class="revision-card-section">
      <div class="revision-card-label">코멘트</div>
      <div class="revision-card-text">${comment ? escapeHtml(comment) : "<em>(없음)</em>"}</div>
    </div>
    <div class="revision-card-section">
      <div class="revision-card-label">반영</div>
      <div class="revision-card-text">${resolution ? escapeHtml(resolution) : "<em>(없음)</em>"}</div>
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

  latest.items.forEach((item, idx) => {
    const card = renderRevisionCard(item, idx, () => {
      const mark = marks[idx];
      if (mark) flashMark(mark);
    });
    bodyEl.appendChild(card);
    cards.push(card);
  });

  latest.items.forEach((item, idx) => {
    const card = cards[idx];
    const mark = renderRevisionMark(item, idx, () => activateCard(card, cards));
    marks.push(mark);
  });
};

const revisionReport = readRevisionReport();
if (revisionReport) renderRevisionReport(revisionReport);
