import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTicketRouterGraph } from "../src/ticket-graph.js";
import { OpenRouterJevBackend } from "../src/backends/openrouter-jev.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const datasetPath = `${rootDir}benchmark/tickets.json`;

try {
  const envFile = await readFile(`${rootDir}.env`, "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = /^(?:export\s+)?([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, "");
  }
} catch {}
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const datasetMd5 = createHash("md5").update(await readFile(datasetPath)).digest("hex");
const recordedMd5 = (await readFile(`${rootDir}benchmark/tickets.md5`, "utf8")).trim();
if (datasetMd5 !== recordedMd5) {
  throw new Error(`Benchmark dataset MD5 mismatch: expected ${recordedMd5}, received ${datasetMd5}`);
}

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error("OPENROUTER_API_KEY is required. Get a key from https://openrouter.ai/keys");
}

const graph = createTicketRouterGraph();
const backend = new OpenRouterJevBackend({
  apiKey,
  model: process.env.JEV_MODEL ?? "typesafe/jev-1.13",
});

const sanitizeState = OpenRouterJevBackend.sanitizeRunStateForBenchmark;
const originalDecide = backend.decide.bind(backend);
backend.decide = async (question, context) => {
  const sanitizedContext = {
    ...context,
    run_state: sanitizeState(context.run_state),
  };
  return originalDecide(question, sanitizedContext);
};

const cases = [];
for (const testCase of dataset) {
  const startedAt = Date.now();
  try {
    const result = await graph.run(testCase, backend);
    const actualNodes = result.run_state.trace.map((item) => item.node_id);
    const passed = result.terminal === testCase.expected_terminal &&
      JSON.stringify(actualNodes) === JSON.stringify(testCase.expected_trace_nodes);
    cases.push({
      id: testCase.id,
      passed,
      expected_terminal: testCase.expected_terminal,
      actual_terminal: result.terminal,
      expected_trace_nodes: testCase.expected_trace_nodes,
      actual_trace_nodes: actualNodes,
      trace: result.run_state.trace.map((item) => ({
        node_id: item.node_id,
        value: item.output.value,
        confidence: item.output.confidence,
      })),
      latency_ms: Date.now() - startedAt,
      error: null,
    });
  } catch (error) {
    cases.push({
      id: testCase.id,
      passed: false,
      expected_terminal: testCase.expected_terminal,
      actual_terminal: null,
      expected_trace_nodes: testCase.expected_trace_nodes,
      actual_trace_nodes: [],
      trace: [],
      latency_ms: Date.now() - startedAt,
      error: error.message,
    });
  }
}

const passedCount = cases.filter((item) => item.passed).length;
const successfulRuns = cases.filter((item) => !item.error);
const confidences = successfulRuns.flatMap((item) => item.trace.map((step) => step.confidence));
const lowConfidenceTraceCount = successfulRuns.filter((item) =>
  item.trace.some((step) => step.confidence < 0.7)
).length;
const humanReviewCount = successfulRuns.filter((item) => item.actual_terminal === "human_review").length;

const report = {
  benchmark: "ticket_router_10_real_jev",
  graph_name: graph.name,
  graph_version: graph.version,
  model: process.env.JEV_MODEL ?? "typesafe/jev-1.13",
  dataset_md5: datasetMd5,
  total: cases.length,
  passed: passedCount,
  failed: cases.length - passedCount,
  accuracy: Number((passedCount / cases.length).toFixed(4)),
  successful_runs: successfulRuns.length,
  request_failures: cases.length - successfulRuns.length,
  avg_confidence: confidences.length
    ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(4))
    : null,
  min_confidence: confidences.length ? Number(Math.min(...confidences).toFixed(4)) : null,
  max_confidence: confidences.length ? Number(Math.max(...confidences).toFixed(4)) : null,
  low_confidence_trace_rate: Number((lowConfidenceTraceCount / successfulRuns.length).toFixed(4)),
  human_review_rate: Number((humanReviewCount / successfulRuns.length).toFixed(4)),
  cases,
};

const json = JSON.stringify(report, null, 2);
await writeFile(`${rootDir}benchmark/real-results.json`, `${json}\n`);

const markdown = [
  "# Real Jev Ticket Router Benchmark",
  "",
  `- Model: \`${report.model}\``,
  `- Dataset: \`benchmark/tickets.json\` (MD5: \`${datasetMd5}\`)`,
  `- Result: **${report.passed}/${report.total} passed**`,
  `- Accuracy: **${report.accuracy}**`,
  `- Request failures: **${report.request_failures}**`,
  `- Average confidence: **${report.avg_confidence}**`,
  `- Human-review rate: **${report.human_review_rate}**`,
  "",
  "| ID | Result | Expected | Actual | Confidence | Error |",
  "| --- | --- | --- | --- | --- | --- |",
  ...cases.map((item) => {
    const confidence = item.trace.at(-1)?.confidence ?? null;
    return `| ${item.id} | ${item.passed ? "✅" : "❌"} | ${item.expected_terminal} | ${item.actual_terminal ?? "-"} | ${confidence ?? "-"} | ${item.error ?? "-"} |`;
  }),
  "",
].join("\n");
await writeFile(`${rootDir}benchmark/real-report.md`, `${markdown}\n`);
console.log(markdown);
if (report.failed > 0) process.exitCode = 1;
