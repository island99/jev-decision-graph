import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DecisionGraph, MockJevBackend } from "../src/index.js";

function createGraph() {
  return new DecisionGraph({
    name: "test_graph",
    version: "1.0.0",
    start: "intent",
    maxDepth: 5,
    nodes: {
      intent: {
        id: "intent",
        decisionId: "intent",
        decisionType: "choice",
        inputRefs: ["input.text"],
        confidenceThreshold: 0.8,
        fallbackNode: "human_review",
        buildQuestion: ({ "input.text": text }) => ({
          type: "choice",
          instructions: "选择意图",
          criteria: { billing: "账单", technical: "技术" },
          text,
        }),
      },
      billing_check: {
        id: "billing_check",
        decisionId: "needs_refund",
        decisionType: "noul",
        inputRefs: ["input.text", "facts.intent"],
        confidenceThreshold: 0.8,
        fallbackNode: "human_review",
        buildQuestion: ({ "input.text": text, "facts.intent": intent }) => ({
          type: "noul",
          instructions: "是否需要退款",
          criteria: { true: "需要退款", false: "无需退款" },
          text,
          known_intent: intent.value,
        }),
      },
    },
    terminals: {
      route_technical: { result: { queue: "technical" } },
      route_refund: { result: { queue: "refund" } },
      route_billing: { result: { queue: "billing" } },
      human_review: { result: { queue: "human" } },
    },
    next(state, output) {
      if (output.decision_id === "intent") {
        return output.value === "billing" ? "billing_check" : "route_technical";
      }
      return output.value === true ? "route_refund" : "route_billing";
    },
  });
}

test("routes a choice decision to a dependent noul decision", async () => {
  const backend = new MockJevBackend((question) => {
    if (question.type === "choice") {
      return { type: "choice", choice: "billing", confidence: 0.92 };
    }
    return { type: "noul", noul: 0.94 };
  });
  const result = await createGraph().run({ text: "多扣费，要求退款" }, backend);

  assert.equal(result.status, "completed");
  assert.equal(result.terminal, "route_refund");
  assert.equal(result.run_state.trace.length, 2);
  assert.equal(result.run_state.facts.intent.value, "billing");
  assert.equal(result.run_state.facts.needs_refund.value, true);
});

test("low confidence is forced to explicit fallback", async () => {
  const backend = new MockJevBackend(() => ({
    type: "choice",
    choice: "billing",
    confidence: 0.6,
  }));
  const result = await createGraph().run({ text: "低置信样例" }, backend);

  assert.equal(result.terminal, "human_review");
  assert.equal(result.result.queue, "human");
  assert.equal(result.run_state.trace.length, 1);
});

test("score decisions are interpolated over scoreValues", async () => {
  const graph = new DecisionGraph({
    name: "score_graph",
    version: "1.0.0",
    start: "priority",
    maxDepth: 2,
    nodes: {
      priority: {
        id: "priority",
        decisionId: "priority",
        decisionType: "score",
        inputRefs: ["input.text"],
        confidenceThreshold: 0.7,
        fallbackNode: "human_review",
        scoreValues: [-1, -0.5, 0, 0.5, 1],
        buildQuestion: ({ "input.text": text }) => ({
          type: "score",
          instructions: "选择优先级档位",
          criteria: ["最低", "低", "中", "高", "最高"],
          text,
        }),
      },
    },
    terminals: {
      done: { result: { ok: true } },
      human_review: { result: { ok: false } },
    },
    next: () => "done",
  });
  const result = await graph.run(
    { text: "样例" },
    new MockJevBackend(() => ({ type: "score", score: 3.5, confidence: 0.9 }))
  );

  assert.equal(result.run_state.facts.priority.value, 0.75);
});

test("backend values outside the declared vocabulary are rejected", async () => {
  const backend = new MockJevBackend(() => ({
    type: "choice",
    choice: "unknown",
    confidence: 0.99,
  }));

  await assert.rejects(() => createGraph().run({ text: "未知类别" }, backend), /outside the declared vocabulary/);
});

test("benchmark dataset is bound to its recorded MD5", async () => {
  const dataset = await readFile(new URL("../benchmark/tickets.json", import.meta.url));
  const recorded = (await readFile(new URL("../benchmark/tickets.md5", import.meta.url), "utf8")).trim();
  const actual = createHash("md5").update(dataset).digest("hex");

  assert.equal(actual, recorded);
});

test("ticket benchmark has ten cases and complete expectations", async () => {
  const dataset = JSON.parse(
    await readFile(new URL("../benchmark/tickets.json", import.meta.url), "utf8")
  );

  assert.equal(dataset.length, 10);
  assert.ok(dataset.every((item) => item.id && item.ticket_text));
  assert.ok(dataset.every((item) => Array.isArray(item.expected_trace_nodes) && item.expected_trace_nodes.length > 0));
});

test("benchmark result is bound to its recorded MD5", async () => {
  const fullResult = JSON.parse(
    await readFile(new URL("../benchmark/results.json", import.meta.url), "utf8")
  );
  const { started_at, finished_at, ...stableResult } = fullResult;
  const recorded = (await readFile(new URL("../benchmark/results.md5", import.meta.url), "utf8")).trim();
  const actual = createHash("md5").update(JSON.stringify(stableResult, null, 2)).digest("hex");

  assert.equal(actual, recorded);
  assert.ok(Date.parse(started_at));
  assert.ok(Date.parse(finished_at));
});
