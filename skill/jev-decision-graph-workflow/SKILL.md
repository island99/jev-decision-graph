---
name: jev-decision-graph-workflow
description: Design and implement multi-step Jev-style typed decision workflows using noul, choice, and score nodes with explicit routing, confidence fallbacks, traces, and benchmarks. Use when the user asks to chain Jev decisions, build a decision graph/state machine, or evaluate Jev-style routing.
---

# Jev Decision Graph Workflow

Use this skill when a task is better represented as a sequence of typed, auditable decisions than as one large LLM prompt. The skill assumes the runtime is the open-source `jev-decision-graph` project or a compatible implementation of its backend contract.

## Runtime Contract

Each decision node must produce a typed result:

- `noul`: a boolean decision from a true probability; map to true only when the threshold is met.
- `choice`: a single label from a declared, closed vocabulary.
- `score`: a tier index, optionally interpolated into business values.

Every node must define:

- `decisionId`: the fact key written into the run state.
- `inputRefs`: explicit `input.*` and/or `facts.*` dependencies.
- `confidenceThreshold`: the minimum confidence required to continue automatically.
- `fallbackNode`: an explicit terminal or review node.

The host owns routing and state. Do not ask a Jev-style model to plan the full workflow implicitly.

## Design Workflow

1. Identify the business outcome and terminal actions. Prefer explicit terminals such as `auto_approve`, `human_review`, `reject`, or a queue name.
2. Decompose the task into small typed decisions. Ask whether each decision is truly boolean, one-of-many, or a tier.
3. Order decisions by information value and cost. Put low-cost gates before expensive or dependent decisions.
4. Declare a closed vocabulary for every `choice` node. Never allow model-invented labels.
5. Add a confidence threshold and fallback for every node. Low-confidence outputs must not propagate silently.
6. Use `facts.*` references when a later decision depends on an earlier result.
7. Add a `maxDepth` guard to prevent cycles or runaway execution.
8. Emit an append-only trace with node ID, node version, value, confidence, probabilities, timing, and cache status.
9. Create a benchmark with expected terminal and expected trace-node sequence. Keep data and results MD5-bound when reproducibility matters.
10. For real-model evaluation, remove expected labels from the request state and record accuracy, confidence, low-confidence rate, human-review rate, and request failures.

## Quality Rules

- Keep each node's question self-contained. Avoid relying on hidden conversation context.
- Prefer several narrow decisions over one broad decision that mixes intent, action, risk, and priority.
- Use `scoreValues` only when tier interpolation has a clear business meaning.
- Do not use a Jev-style decision node for open-ended generation, multi-turn reasoning, or tasks that require producing free text.
- Use a model-backed decision only after a benchmark establishes adequate accuracy and calibration for the task.
- Preserve user authorization and privacy constraints when sending state to an external backend.

## Implementation Assets

- Runtime examples: [`examples/ticket.js`](https://github.com/island99/jev-decision-graph/blob/main/examples/ticket.js)
- Graph definition: [`src/ticket-graph.js`](https://github.com/island99/jev-decision-graph/blob/main/src/ticket-graph.js)
- Benchmark dataset: [`benchmark/tickets.json`](https://github.com/island99/jev-decision-graph/blob/main/benchmark/tickets.json)
- Real-model benchmark: [`scripts/run-real-benchmark.mjs`](https://github.com/island99/jev-decision-graph/blob/main/scripts/run-real-benchmark.mjs)

When generating a new project, use the template in `templates/decision-graph.template.js` as the structural starting point. Adapt the vocabulary and routing to the user's domain; do not copy the ticket example unchanged.
