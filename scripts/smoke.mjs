// htmlreview — end-to-end smoke test
//
// 1. spawn bin/htmlreview.mjs with stdin = markdown, ephemeral port
// 2. capture http URL from stderr
// 3. GET /  → expect rendered heading + bundle script tag
// 4. POST /submit  → expect 200
// 5. proc exit 0
// 6. parse stdout — must be a valid W3C AnnotationCollection

import { spawn } from "node:child_process";
import { ok, equal } from "node:assert/strict";

const MARKDOWN = `# Hello\n\nThis is **bold** text.\n\n## Sub\n\n- item one\n- item two\n`;

const STARTUP_TIMEOUT_MS = 5000;
const EXIT_TIMEOUT_MS = 8000;

const captureUrl = (proc) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("URL not announced within startup timeout")), STARTUP_TIMEOUT_MS);
    proc.stderr.on("data", (chunk) => {
      const m = chunk.toString().match(/htmlreview:\s+(http:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`proc exited (${code}) before URL was announced`));
    });
  });

const sampleItem = {
  selector: {
    type: "TextQuoteSelector",
    exact: "bold",
    prefix: "This is ",
    suffix: " text.",
  },
  comment: "왜 bold?",
};

const proc = spawn("node", ["bin/htmlreview.mjs", "--no-open", "--port", "0", "--title", "Smoke"], {
  stdio: ["pipe", "pipe", "pipe"],
});
proc.stdin.write(MARKDOWN);
proc.stdin.end();

let stdoutBuf = "";
proc.stdout.on("data", (c) => { stdoutBuf += c.toString(); });

const url = await captureUrl(proc);

const getRes = await fetch(url);
ok(getRes.ok, `GET / failed (${getRes.status})`);
const html = await getRes.text();
ok(html.includes('<h1 id="hello">Hello</h1>'), "rendered heading missing");
ok(html.includes("app.bundle.js"), "bundle script tag missing");
ok(html.includes('<title>Smoke</title>'), "title not interpolated");

const bundleRes = await fetch(url + "app.bundle.js");
ok(bundleRes.ok, `GET /app.bundle.js failed (${bundleRes.status})`);
const bundleText = await bundleRes.text();
ok(bundleText.length > 1000, "bundle suspiciously small");

const submitRes = await fetch(url + "submit", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ status: "revision_requested", items: [sampleItem] }),
});
ok(submitRes.ok, `POST /submit failed (${submitRes.status})`);

const exitCode = await Promise.race([
  new Promise((r) => proc.on("exit", r)),
  new Promise((_, rej) => setTimeout(() => rej(new Error("exit timeout")), EXIT_TIMEOUT_MS)),
]);
equal(exitCode, 0, `non-zero exit (${exitCode})`);

const result = JSON.parse(stdoutBuf.trim());
equal(result["@context"], "http://www.w3.org/ns/anno.jsonld");
equal(result.type, "AnnotationCollection");
equal(result.status, "revision_requested");
ok(typeof result.target.source === "string" && result.target.source.startsWith("urn:htmlreview:doc:"), "doc URN missing/wrong prefix");
equal(result.target.format, "text/markdown");
equal(result.items.length, 1);

const ann = result.items[0];
equal(ann.type, "Annotation");
ok(ann.id.startsWith("urn:htmlreview:annotation:"), "annotation id missing/wrong prefix");
equal(ann.motivation, "commenting");
equal(ann.body[0].type, "TextualBody");
equal(ann.body[0].value, "왜 bold?");
equal(ann.target.selector.exact, "bold");
equal(ann.target.selector.prefix, "This is ");
equal(ann.target.selector.suffix, " text.");

console.log("smoke: OK");
