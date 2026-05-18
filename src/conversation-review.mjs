const escapeHtml = (text) =>
  String(text ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));

const countMatches = (text, pattern) => (text.match(pattern) ?? []).length;

const MIN_VISUAL_SCORE = 8;
const MIN_VISUAL_TEXT_LENGTH = 1800;
const MIN_LINE_COUNT = 80;

export const parseConversationReviewInput = (input) => {
  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (err) {
    throw new Error(`invalid conversation-review JSON: ${err.message}`);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("conversation-review input must be a JSON object");
  }

  const userText = typeof parsed.userText === "string" ? parsed.userText : "";
  const assistantText = typeof parsed.assistantText === "string" ? parsed.assistantText : "";

  if (!userText.trim()) throw new Error("conversation-review input requires userText");
  if (!assistantText.trim()) throw new Error("conversation-review input requires assistantText");

  return {
    userText,
    assistantText,
    title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : "Conversation review",
  };
};

export const analyzeConversationReview = (userText, assistantText) => {
  const combinedText = `${userText}\n${assistantText}`;
  const metrics = {
    chars: assistantText.length,
    lines: assistantText.split("\n").length,
    headings: countMatches(assistantText, /^#{1,4}\s+/gm),
    bullets: countMatches(assistantText, /^\s*[-*]\s+/gm),
    numbered: countMatches(assistantText, /^\s*\d+\.\s+/gm),
    tableRows: countMatches(assistantText, /^\|.+\|$/gm),
    codeBlocks: countMatches(assistantText, /```/g) / 2,
    optionKeywords: countMatches(combinedText, /\b(option|case|approach|choice|alternative|후보|선택지|방식|대안)\b/gi),
    workflowKeywords: countMatches(combinedText, /\b(flow|workflow|pipeline|step|phase|sequence|단계|흐름|순서|파이프라인)\b/gi),
    tradeoffKeywords: countMatches(combinedText, /\b(trade.?off|risk|side.?effect|pros?|cons?|비교|장점|단점|리스크|위험|부작용|충돌)\b/gi),
    comparisonTargets: countMatches(combinedText, /\bvs\b|\bversus\b|비교|대비|차이/g),
  };

  const signals = [];
  const addSignal = (condition, label, score, reason) => {
    if (condition) signals.push({ label, score, reason });
  };

  const visualElementCount = [metrics.tableRows >= 4, metrics.bullets + metrics.numbered >= 14, metrics.codeBlocks >= 2].filter(Boolean).length;
  const groups = {
    painPhrase:
      metrics.lines > MIN_LINE_COUNT ||
      metrics.comparisonTargets >= 2 ||
      metrics.workflowKeywords >= 3 ||
      metrics.tradeoffKeywords >= 3,
    quantifiedMetric:
      metrics.lines > MIN_LINE_COUNT ||
      visualElementCount >= 2 ||
      metrics.optionKeywords >= 3 ||
      metrics.workflowKeywords >= 3 ||
      metrics.tradeoffKeywords >= 3 ||
      metrics.headings >= 4,
    painScenario:
      /(vs|비교|결정|분리|리팩터링|마이그레이션|위험도|롤아웃|디자인 시스템|token|토큰|인시던트|RFC|proposal|design doc|architecture review|시각적으로|직관적으로|검토 띄워)/i.test(combinedText),
  };

  addSignal(metrics.chars >= MIN_VISUAL_TEXT_LENGTH, "Long answer", 2, `${metrics.chars} chars`);
  addSignal(metrics.lines > MIN_LINE_COUNT, "Beyond one screen", 2, `${metrics.lines} lines`);
  addSignal(metrics.headings >= 4, "Sectioned structure", 2, `${metrics.headings} headings`);
  addSignal(metrics.bullets + metrics.numbered >= 14, "Dense list", 2, `${metrics.bullets + metrics.numbered} list items`);
  addSignal(metrics.tableRows >= 4, "Matrix/table", 3, `${metrics.tableRows} table rows`);
  addSignal(metrics.codeBlocks >= 2 && metrics.chars >= 2200, "Code/config blocks", 1, `${metrics.codeBlocks} code blocks`);
  addSignal(metrics.optionKeywords >= 3, "Alternatives", 2, `${metrics.optionKeywords} option terms`);
  addSignal(metrics.workflowKeywords >= 3, "Workflow", 2, `${metrics.workflowKeywords} workflow terms`);
  addSignal(metrics.tradeoffKeywords >= 3, "Trade-offs", 2, `${metrics.tradeoffKeywords} trade-off terms`);
  addSignal(groups.painScenario, "Pain scenario", 2, "request/answer shape benefits from HTML");

  const score = signals.reduce((sum, signal) => sum + signal.score, 0);
  const signalGroupCount = Object.values(groups).filter(Boolean).length;

  return {
    score,
    signalGroupCount,
    shouldReview: metrics.chars >= MIN_VISUAL_TEXT_LENGTH && score >= MIN_VISUAL_SCORE && signalGroupCount >= 2,
    signals,
    groups,
    metrics,
  };
};

const extractHeadings = (text) =>
  [...text.matchAll(/^#{1,4}\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .slice(0, 8);

const extractListItems = (text) =>
  [...text.matchAll(/^\s*(?:[-*]|\d+\.)\s+(.+)$/gm)]
    .map((match) => match[1].trim())
    .filter((item) => item.length >= 8)
    .slice(0, 12);

const renderMetricRows = (metrics) => Object.entries(metrics)
  .map(([key, value]) => `<div class="metric"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>`)
  .join("\n");

export const renderConversationReviewHtml = ({ userText, assistantText, title = "Conversation review" }) => {
  const analysis = analyzeConversationReview(userText, assistantText);
  const headings = extractHeadings(assistantText);
  const listItems = extractListItems(assistantText);
  const scorePercent = Math.min(100, Math.round((analysis.score / Math.max(12, analysis.score, MIN_VISUAL_SCORE)) * 100));

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    .review-shell { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; }
    .hero { padding: 28px; border-radius: 24px; background: linear-gradient(135deg, #eef2ff 0%, #f8fafc 55%, #ecfeff 100%); border: 1px solid #dbeafe; margin-bottom: 24px; }
    .eyebrow { font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: #4f46e5; font-weight: 800; }
    .hero h1 { margin: 8px 0 10px; font-size: 32px; line-height: 1.15; }
    .hero p { margin: 0; color: #475569; font-size: 15px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin: 18px 0 24px; }
    .two-column { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; margin: 18px 0 24px; }
    .card { border: 1px solid #e2e8f0; border-radius: 18px; padding: 16px; background: #fff; box-shadow: 0 8px 24px rgba(15, 23, 42, .05); }
    .card h2, .card h3 { margin-top: 0; }
    .score-ring { width: 112px; height: 112px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(#4f46e5 ${scorePercent}%, #e2e8f0 0); margin: 4px auto 12px; }
    .score-ring span { width: 78px; height: 78px; border-radius: 50%; background: white; display: grid; place-items: center; font-weight: 900; font-size: 24px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { border-radius: 999px; padding: 6px 10px; background: #eef2ff; color: #3730a3; font-size: 13px; font-weight: 700; }
    .metric { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px dashed #e2e8f0; font-size: 14px; }
    .metric strong { color: #0f172a; }
    .timeline { counter-reset: step; list-style: none; padding: 0; margin: 0; }
    .timeline li { counter-increment: step; position: relative; min-height: 44px; padding: 0 0 16px 48px; border-left: 2px solid #dbeafe; margin-left: 16px; display: flex; align-items: center; }
    .timeline li::before { content: counter(step); position: absolute; left: -18px; top: 50%; transform: translateY(-50%); width: 34px; height: 34px; border-radius: 50%; background: #2563eb; color: white; display: grid; place-items: center; font-weight: 800; }
    .question { border-left: 5px solid #14b8a6; background: #f0fdfa; padding: 16px; border-radius: 14px; white-space: pre-wrap; }
    .original-markdown { white-space: pre-wrap; overflow: auto; background: #0f172a; color: #e2e8f0; padding: 18px; border-radius: 16px; font-size: 13px; line-height: 1.65; }
    details { border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; background: #fff; }
    summary { cursor: pointer; font-weight: 800; }
    @media (max-width: 900px) { .two-column { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <article class="review-shell">
    <section class="hero">
      <div class="eyebrow">Conversation review · visual artifact</div>
      <h1>${escapeHtml(title)}</h1>
      <p>Assistant output is reorganized into a browser-native review surface: signals first, structure second, original text last.</p>
    </section>

    <section class="grid">
      <div class="card">
        <h2>Visual need</h2>
        <div class="score-ring"><span>${analysis.score}</span></div>
        <p>Review generated when score ≥ ${MIN_VISUAL_SCORE} and at least two signal groups match.</p>
      </div>
      <div class="card">
        <h2>Detected signals</h2>
        <div class="chips">
          ${analysis.signals.map((signal) => `<span class="chip">${escapeHtml(signal.label)} +${signal.score}</span>`).join("\n")}
        </div>
        <p>groups: ${analysis.signalGroupCount}/3 · pain=${analysis.groups.painPhrase ? "yes" : "no"}, metric=${analysis.groups.quantifiedMetric ? "yes" : "no"}, scenario=${analysis.groups.painScenario ? "yes" : "no"}</p>
      </div>
      <div class="card">
        <h2>Density</h2>
        ${renderMetricRows(analysis.metrics)}
      </div>
    </section>

    <section class="card">
      <h2>User request</h2>
      <div class="question">${escapeHtml(userText)}</div>
    </section>

    <section class="two-column">
      <div class="card">
        <h2>Structure map</h2>
        ${headings.length > 0 ? `<ol class="timeline">${headings.map((heading) => `<li>${escapeHtml(heading)}</li>`).join("\n")}</ol>` : "<p>No explicit headings detected.</p>"}
      </div>
      <div class="card">
        <h2>Key items</h2>
        ${listItems.length > 0 ? `<ul>${listItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}</ul>` : "<p>No dense list items detected.</p>"}
      </div>
    </section>

    <details open>
      <summary>Original assistant response</summary>
      <pre class="original-markdown">${escapeHtml(assistantText)}</pre>
    </details>
  </article>
</body>
</html>`;
};

export const renderConversationReviewFromJson = (input) => renderConversationReviewHtml(parseConversationReviewInput(input));
