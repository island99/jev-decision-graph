import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createTicketRouterGraph } from "../src/ticket-graph.js";
import { TicketBenchmarkBackend } from "../src/backends/ticket-benchmark-backend.js";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const datasetPath = `${rootDir}benchmark/tickets.json`;
const dataset = JSON.parse(await readFile(datasetPath, "utf8"));
const datasetMd5 = createHash("md5").update(await readFile(datasetPath)).digest("hex");
const recordedMd5 = (await readFile(`${rootDir}benchmark/tickets.md5`, "utf8")).trim();

if (datasetMd5 !== recordedMd5) {
  throw new Error(`Benchmark dataset MD5 mismatch: expected ${recordedMd5}, received ${datasetMd5}`);
}

const graph = createTicketRouterGraph();
const backend = new TicketBenchmarkBackend();
const startedAt = new Date();
const cases = [];

for (const testCase of dataset) {
  const result = await graph.run(testCase, backend);
  const actualNodes = result.run_state.trace.map((item) => item.node_id);
  const passed = result.terminal === testCase.expected_terminal &&
    JSON.stringify(actualNodes) === JSON.stringify(testCase.expected_trace_nodes);

  cases.push({
    id: testCase.id,
    ticket_text: testCase.ticket_text,
    passed,
    expected_terminal: testCase.expected_terminal,
    actual_terminal: result.terminal,
    expected_trace_nodes: testCase.expected_trace_nodes,
    actual_trace_nodes: actualNodes,
    result: result.result,
  });
}

const passedCount = cases.filter((item) => item.passed).length;
const report = {
  benchmark: "ticket_router_10",
  graph_name: graph.name,
  graph_version: graph.version,
  dataset_md5: datasetMd5,
  started_at: startedAt.toISOString(),
  finished_at: new Date().toISOString(),
  total: cases.length,
  passed: passedCount,
  failed: cases.length - passedCount,
  accuracy: Number((passedCount / cases.length).toFixed(4)),
  cases,
};

const stableReport = {
  benchmark: report.benchmark,
  graph_name: report.graph_name,
  graph_version: report.graph_version,
  dataset_md5: report.dataset_md5,
  total: report.total,
  passed: report.passed,
  failed: report.failed,
  accuracy: report.accuracy,
  cases,
};
const stableJson = JSON.stringify(stableReport, null, 2);
const fullJson = JSON.stringify({ ...stableReport, started_at: report.started_at, finished_at: report.finished_at }, null, 2);
await writeFile(`${rootDir}benchmark/results.json`, `${fullJson}\n`);
await writeFile(`${rootDir}benchmark/results.md5`, `${createHash("md5").update(stableJson).digest("hex")}\n`);

const markdown = [
  "# Ticket Router Benchmark",
  "",
  `- Dataset: \`benchmark/tickets.json\` (MD5: \`${datasetMd5}\`)`,
  `- Graph: \`${graph.name}@${graph.version}\``,
  `- Result: **${passedCount}/${cases.length} passed**`,
  `- Accuracy: **${report.accuracy}**`,
  "",
  "| ID | Result | Expected | Actual | Trace |",
  "| --- | --- | --- | --- | --- |",
  ...cases.map((item) => `| ${item.id} | ${item.passed ? "✅" : "❌"} | ${item.expected_terminal} | ${item.actual_terminal} | ${item.actual_trace_nodes.join(" → ")} |`),
  "",
].join("\n");
await writeFile(`${rootDir}benchmark/report.md`, `${markdown}\n`);

console.log(markdown);

if (report.failed > 0) process.exitCode = 1;
