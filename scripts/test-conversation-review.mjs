import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeConversationReview,
  parseConversationReviewInput,
  renderConversationReviewFromJson,
} from "../src/conversation-review.mjs";

test("parseConversationReviewInput validates required fields", () => {
  assert.throws(() => parseConversationReviewInput("{}"), /requires userText/);
  assert.throws(() => parseConversationReviewInput(JSON.stringify({ userText: "hi" })), /requires assistantText/);
});

test("analyzeConversationReview detects visual review need", () => {
  const assistantText = [
    "## Option A vs B vs C",
    "- migration risk and trade-off",
    "- workflow step and phase",
    "- rollout risk and side-effect",
    "## Decision matrix",
    "| Option | Risk | Trade-off |",
    "|---|---|---|",
    "| A | medium | cost |",
    "| B | high | speed |",
    "## Rollout workflow",
    "1. phase one",
    "2. phase two",
    "3. phase three",
    "4. phase four",
    "```json",
    "{ \"command\": \"uvx\" }",
    "```",
  ].join("\n").repeat(30);

  const analysis = analyzeConversationReview("A vs B vs C 중 무엇이 나아?", assistantText);

  assert.equal(analysis.shouldReview, true);
  assert.ok(analysis.signalGroupCount >= 2);
  assert.ok(analysis.score >= 8);
});

test("renderConversationReviewFromJson returns self-contained HTML", () => {
  const html = renderConversationReviewFromJson(JSON.stringify({
    title: "Review title",
    userText: "X vs Y 비교해줘",
    assistantText: "## A\n\n- one\n- two\n\n## B\n\nOriginal response body".repeat(80),
  }));

  assert.match(html, /<!doctype html>/);
  assert.match(html, /Review title/);
  assert.match(html, /Structure map/);
  assert.match(html, /Original assistant response/);
});
