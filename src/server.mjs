// htmlreview — HTTP 서버. 로컬 단발성 review 게이트.
//
// 책임:
// 1. 입력(markdown/HTML)을 시맨틱 HTML 로 렌더
// 2. 클라이언트 번들 + 페이지 serve
// 3. /submit 으로 받은 raw item 들을 W3C Annotation envelope 으로 감싸 stdout 으로 resolve
// 4. timeout / browser-open / 안전한 close 처리

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";

import { renderMarkdownToHtml } from "./renderer.mjs";
import { sanitizeHtmlInput } from "./sanitize.mjs";
import { buildAnnotation, computeSourceUrn } from "./annotation.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, "..", "web");

const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const escapeForScriptTag = (json) =>
  json.replace(/</g, "\\u003c").split(LS).join("\\u2028").split(PS).join("\\u2029");

const readWebFile = (name) => readFile(join(WEB_DIR, name), "utf8");

const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });

const openInBrowser = (url) => {
  const cmd =
    process.platform === "darwin" ? ["open", [url]] :
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] :
    ["xdg-open", [url]];
  try {
    const child = spawn(cmd[0], cmd[1], { stdio: "ignore", detached: true });
    child.unref();
  } catch {
    // ignore
  }
};

const closeBrowserTabsMacOS = (url) => {
  if (process.platform !== "darwin") return;
  const apps = ["Google Chrome", "Brave Browser", "Microsoft Edge", "Arc", "Safari"];
  const block = (app) => `
    try
      tell application "${app}"
        set winList to windows
        repeat with w in winList
          set tabList to tabs of w
          set i to (count tabList)
          repeat while i > 0
            try
              if URL of (item i of tabList) starts with targetURL then
                close (item i of tabList)
              end if
            end try
            set i to i - 1
          end repeat
        end repeat
      end tell
    end try
  `;
  const script = `set targetURL to "${url}"\n${apps.map(block).join("\n")}`;
  try {
    const c = spawn("osascript", ["-e", script], { stdio: "ignore", detached: true });
    c.unref();
  } catch {
    // ignore
  }
};

const renderInput = (input, format) => {
  if (format === "text/markdown") return renderMarkdownToHtml(input);
  if (format === "text/html") return sanitizeHtmlInput(input);
  throw new Error(`unsupported format: ${format}`);
};

export const runReview = async (opts) => {
  const bodyHtml = renderInput(opts.input, opts.format);
  const sourceUrn = computeSourceUrn(opts.input);

  const [indexHtml, appBundle, styleCss, bundleMap] = await Promise.all([
    readWebFile("index.html"),
    readWebFile("app.bundle.js"),
    readWebFile("style.css"),
    readWebFile("app.bundle.js.map").catch(() => null),
  ]);

  const revisionJson = JSON.stringify(opts.revisionReport ?? null);
  const page = indexHtml
    .replaceAll("__TITLE__", escapeHtml(opts.title))
    .replace("__CONTENT__", bodyHtml)
    .replace("__REVISION_REPORT_JSON__", escapeForScriptTag(revisionJson));

  return new Promise((resolve, reject) => {
    let resolved = false;
    let timeoutHandle = null;
    let baseUrl = "";

    const server = createServer(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;
      const method = req.method;

      const send = (status, body, contentType) => {
        res.writeHead(status, { "Content-Type": contentType });
        res.end(body);
      };

      if (method === "GET" && (path === "/" || path === "/index.html")) {
        return send(200, page, "text/html; charset=utf-8");
      }
      if (method === "GET" && path === "/app.bundle.js") {
        return send(200, appBundle, "application/javascript; charset=utf-8");
      }
      if (method === "GET" && path === "/app.bundle.js.map" && bundleMap) {
        return send(200, bundleMap, "application/json");
      }
      if (method === "GET" && path === "/style.css") {
        return send(200, styleCss, "text/css; charset=utf-8");
      }
      if (method === "POST" && path === "/submit") {
        let payload;
        try { payload = await readJsonBody(req); }
        catch { return send(400, "Bad JSON", "text/plain; charset=utf-8"); }

        const rawItems = Array.isArray(payload.items) ? payload.items : [];
        const status = payload.status === "approved" ? "approved" : "revision_requested";

        const items = rawItems
          .filter((it) => it && it.selector && typeof it.comment === "string")
          .map((it) =>
            buildAnnotation({
              selector: it.selector,
              commentText: it.comment,
              images: Array.isArray(it.images) ? it.images : [],
              sourceUrn,
              format: opts.format,
            }),
          );

        const collection = {
          "@context": "http://www.w3.org/ns/anno.jsonld",
          type: "AnnotationCollection",
          status,
          target: { source: sourceUrn, format: opts.format },
          items,
        };

        if (!resolved) {
          resolved = true;
          if (baseUrl && opts.openBrowser) closeBrowserTabsMacOS(baseUrl);
          queueMicrotask(() => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            setTimeout(() => server.close(), 50);
            resolve(collection);
          });
        }
        return send(200, JSON.stringify({ ok: true }), "application/json");
      }
      send(404, "Not Found", "text/plain; charset=utf-8");
    });

    server.on("error", (err) => {
      if (resolved) return;
      resolved = true;
      reject(err);
    });

    server.listen(opts.port, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : opts.port;
      baseUrl = `http://127.0.0.1:${port}/`;
      process.stderr.write(`htmlreview: ${baseUrl}\n`);
      if (opts.openBrowser) openInBrowser(baseUrl);

      if (opts.timeoutMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          server.close();
          reject(new Error(`htmlreview timeout after ${opts.timeoutMs}ms`));
        }, opts.timeoutMs);
      }
    });
  });
};
