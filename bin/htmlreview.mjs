#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile, access } from "node:fs/promises";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderConversationReviewFromJson } from "../src/conversation-review.mjs";
import { runReview } from "../src/server.mjs";

const HELP = `Usage: htmlreview [options] [file]

Open a local web review for a markdown or HTML document.
Outputs a W3C AnnotationCollection JSON to stdout when user clicks "진행".

Options:
  --title <text>              Page title (default: "Review")
  --port <n>                  HTTP port (default: random ephemeral)
  --no-open                   Don't auto-open browser
  --input-format <md|html>    Force input format (default: inferred from extension; "md" for stdin)
  --preset <name>             Transform input before review. Supported: conversation-review
  --revision-report <file>    Previous-round comments as W3C AnnotationCollection JSON.
                              Renders left sidebar + in-content "변경됨" badges.
  --timeout <s>               Auto-fail if no submission within N seconds
  -v, --version               Show version
  -h, --help                  Show this help

Input:
  Pass a file as positional argument, or pipe via stdin:
    htmlreview plan.md
    cat plan.md | htmlreview --input-format md
    htmlreview design.html
    htmlreview conversation.json --preset conversation-review

Output:
  W3C AnnotationCollection JSON to stdout. Exit code 0 on submit.
`;

const readStdin = async () => {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
};

const fileExists = async (p) => {
  try { await access(p); return true; } catch { return false; }
};

const readPackageVersion = async () => {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(await readFile(join(__dirname, "..", "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
};

const inferFormat = (filePath, override) => {
  if (override === "md" || override === "markdown") return "text/markdown";
  if (override === "html") return "text/html";
  if (filePath) {
    const ext = extname(filePath).toLowerCase();
    if (ext === ".md" || ext === ".markdown") return "text/markdown";
    if (ext === ".html" || ext === ".htm") return "text/html";
  }
  return "text/markdown";
};

const main = async () => {
  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      options: {
        title: { type: "string" },
        port: { type: "string" },
        "no-open": { type: "boolean" },
        "input-format": { type: "string" },
        preset: { type: "string" },
        "revision-report": { type: "string" },
        timeout: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
      allowPositionals: true,
    });
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.stderr.write(HELP);
    process.exit(2);
  }

  const { values, positionals } = parsed;

  if (values.help) {
    process.stdout.write(HELP);
    process.exit(0);
  }
  if (values.version) {
    process.stdout.write(`${await readPackageVersion()}\n`);
    process.exit(0);
  }

  const file = positionals[0];
  let input;
  if (file) {
    if (!(await fileExists(file))) {
      process.stderr.write(`error: file not found: ${file}\n`);
      process.exit(1);
    }
    input = await readFile(file, "utf8");
  } else if (!process.stdin.isTTY) {
    input = await readStdin();
  } else {
    process.stderr.write("error: no input. Pass a file or pipe via stdin.\n");
    process.stderr.write(HELP);
    process.exit(2);
  }

  if (!input.trim()) {
    process.stderr.write("error: empty input\n");
    process.exit(1);
  }

  let revisionReport = null;
  if (values["revision-report"]) {
    const reportPath = values["revision-report"];
    if (!(await fileExists(reportPath))) {
      process.stderr.write(`error: revision-report file not found: ${reportPath}\n`);
      process.exit(1);
    }
    try {
      revisionReport = JSON.parse(await readFile(reportPath, "utf8"));
    } catch (err) {
      process.stderr.write(`error: invalid revision-report JSON: ${err.message}\n`);
      process.exit(1);
    }
  }

  let format = inferFormat(file, values["input-format"]);
  if (values.preset) {
    if (values.preset !== "conversation-review") {
      process.stderr.write(`error: unsupported preset: ${values.preset}\n`);
      process.exit(2);
    }
    try {
      input = renderConversationReviewFromJson(input);
      format = "text/html";
    } catch (err) {
      process.stderr.write(`error: ${err.message}\n`);
      process.exit(1);
    }
  }

  const port = values.port ? parseInt(values.port, 10) : 0;
  if (Number.isNaN(port) || port < 0 || port > 65535) {
    process.stderr.write(`error: invalid port: ${values.port}\n`);
    process.exit(2);
  }

  const timeoutSec = values.timeout ? parseFloat(values.timeout) : 0;
  if (Number.isNaN(timeoutSec) || timeoutSec < 0) {
    process.stderr.write(`error: invalid timeout: ${values.timeout}\n`);
    process.exit(2);
  }

  try {
    const result = await runReview({
      input,
      format,
      title: values.title ?? "Review",
      port,
      openBrowser: !values["no-open"],
      timeoutMs: Math.floor(timeoutSec * 1000),
      revisionReport,
    });
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exit(0);
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exit(1);
  }
};

main();
