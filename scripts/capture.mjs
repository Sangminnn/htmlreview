#!/usr/bin/env node
// Playwright 로 docs/demo.md + demo-revision.json 기반 스크린샷 자동 캡처.
// 산출물: docs/screenshots/{main,bubble,revision,conversation-review}.png

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const outDir = join(repoRoot, "docs", "screenshots");

const VIEWPORT = { width: 1440, height: 900 };
const DEMO_MD = join(repoRoot, "docs", "demo.md");
const DEMO_REVISION = join(repoRoot, "docs", "demo-revision.json");
const CONVERSATION_REVIEW = join(repoRoot, "docs", "examples", "conversation-review.json");

const waitForUrl = (proc) =>
  new Promise((resolve, reject) => {
    let buf = "";
    const onData = (chunk) => {
      buf += chunk.toString();
      const match = buf.match(/htmlreview:\s+(http:\/\/[^\s]+)/);
      if (match) {
        proc.stderr.off("data", onData);
        resolve(match[1]);
      }
    };
    proc.stderr.on("data", onData);
    proc.once("exit", (code) => reject(new Error(`htmlreview exited early (code=${code})`)));
    setTimeout(() => reject(new Error("timeout waiting for htmlreview URL")), 10_000);
  });

const startBin = async (extraArgs = [], file = DEMO_MD) => {
  const args = ["bin/htmlreview.mjs", file, "--no-open", "--title", "htmlreview demo", ...extraArgs];
  const proc = spawn("node", args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  const url = await waitForUrl(proc);
  return { proc, url };
};

const stopBin = async (proc, url) => {
  try {
    await fetch(`${url}submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", items: [] }),
    });
  } catch {
    proc.kill("SIGTERM");
  }
  await new Promise((resolve) => proc.once("exit", resolve));
};

const newPage = async (browser, url) => {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector(".md-doc h1");
  return { context, page };
};

const captureMain = async (browser) => {
  const { proc, url } = await startBin();
  try {
    const { context, page } = await newPage(browser, url);
    await page.screenshot({ path: join(outDir, "main.png"), fullPage: false });
    await context.close();
  } finally {
    await stopBin(proc, url);
  }
};

const captureBubble = async (browser) => {
  const { proc, url } = await startBin();
  try {
    const { context, page } = await newPage(browser, url);
    // 표 셀 클릭 — block-click 으로 bubble 자동
    const target = page.locator("td").filter({ hasText: "분리 1" }).first();
    await target.scrollIntoViewIfNeeded();
    await target.click();
    const bubble = page.locator(".comment-bubble");
    await bubble.waitFor({ state: "visible" });
    await bubble.locator("textarea").fill(
      "토큰 갱신 정책(만료 임박 자동 재발급 / 강제 회전)도 표에 명시되면 좋겠음",
    );
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outDir, "bubble.png"), fullPage: false });
    await context.close();
  } finally {
    await stopBin(proc, url);
  }
};

const captureRevision = async (browser) => {
  const { proc, url } = await startBin(["--revision-report", DEMO_REVISION]);
  try {
    const { context, page } = await newPage(browser, url);
    // 사이드바 + 본문 변경됨 뱃지 렌더 대기
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(outDir, "revision.png"), fullPage: false });
    await context.close();
  } finally {
    await stopBin(proc, url);
  }
};

const captureConversationReview = async (browser) => {
  const { proc, url } = await startBin(["--preset", "conversation-review"], CONVERSATION_REVIEW);
  try {
    const { context, page } = await newPage(browser, url);
    await page.waitForSelector(".review-shell .hero");
    await page.screenshot({ path: join(outDir, "conversation-review.png"), fullPage: false });
    await context.close();
  } finally {
    await stopBin(proc, url);
  }
};

const main = async () => {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    await captureMain(browser);
    await captureBubble(browser);
    await captureRevision(browser);
    await captureConversationReview(browser);
  } finally {
    await browser.close();
  }
  console.log("captured: docs/screenshots/{main,bubble,revision,conversation-review}.png");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
