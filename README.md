# Jev Decision Graph

Jev Decision Graph is a Node.js runtime for composing Jev-style, single-step typed decisions into reliable multi-step business workflows. It keeps routing, state, confidence, observability, and fallback policy explicit instead of hiding them inside one large prompt.

This project is useful because many real automation problems are not free-text generation problems. They are typed decision problems: whether a request is relevant, which intent it belongs to, whether a refund is required, what priority it has, and whether the result is confident enough to act on automatically. Jev-style models are fast and type-safe for these decisions, but a production workflow still needs orchestration. This runtime provides that missing layer.

## Project Relationship to Jev

"Jev" refers to the System One Model created by TypeSafe AI and founded by Diogo Almeida, a co-inventor of ChatGPT. This is an independent open-source orchestration layer for Jev-style typed decision APIs. It is not an official TypeSafe AI project and is not endorsed by or affiliated with TypeSafe AI.

The project deliberately uses the term "Jev-style" for two reasons: the runtime models `noul`, `choice`, and `score` decisions in the shape exposed by Jev, while remaining backend-agnostic enough to connect other decision models that follow the same typed contract.

## Why It Matters

Traditional LLM pipelines often turn a business process into one large prompt. That approach is difficult to audit, hard to test, expensive to debug, and prone to propagating errors across steps. This project instead turns each decision into a typed node and makes the transitions between nodes explicit.

The result is a workflow that is closer to a state machine than a chatbot. Each node has a clear vocabulary, a confidence threshold, and a deterministic fallback. Every execution produces an append-only trace, allowing teams to replay decisions, compare model versions, and diagnose failures at the node level.

## Innovations

- **Typed decision graph**: Supports `noul`, `choice`, and `score` decisions, matching the native output modes of Jev-style decision models.
- **Explicit vocabulary control**: Answers outside the declared `choice` criteria are rejected, preventing vocabulary drift.
- **Confidence-aware transitions**: Every node must declare a fallback node, so low-confidence answers cannot continue silently down the chain.
- **Dependent multi-step decisions**: Later nodes can reference earlier facts through typed `facts.*` input paths.
- **Score interpolation**: `score` results can be mapped from tier indices to business values, such as `-1..1` sentiment or priority levels.
- **Append-only trace**: Each step records node version, decision value, confidence, probabilities, timing, and cache status.
- **Deterministic benchmark**: Includes 10 realistic ticket-routing cases with MD5-bound data and results for reproducibility.
- **Backend abstraction**: Ships with a mock backend for development and an OpenRouter Jev adapter for real calls.

## Quick Start

Requires Node.js 20+.

```bash
npm install
npm test
npm run benchmark
npm run benchmark:real
npm start
```

To run the real Jev evaluation, add your key to a local `.env` file:

```bash
OPENROUTER_API_KEY=sk-or-...
```

## Minimal Example

```js
import { DecisionGraph, MockJevBackend } from "./src/index.js";

const graph = new DecisionGraph({
  name: "hello",
  version: "1.0.0",
  start: "is_relevant",
  maxDepth: 5,
  nodes: {
    is_relevant: {
      id: "is_relevant",
      decisionId: "is_relevant",
      decisionType: "noul",
      inputRefs: ["input.text"],
      confidenceThreshold: 0.8,
      fallbackNode: "human_review",
      buildQuestion: ({ "input.text": text }) => ({
        type: "noul",
        instructions: "Does this request require handling?",
        criteria: { true: "Needs handling", false: "Does not need handling" },
        text,
      }),
    },
  },
  terminals: {
    done: { result: { action: "auto" } },
    human_review: { result: { action: "review" } },
  },
  next: (state, output) => output.value ? "done" : "human_review",
});

const result = await graph.run(
  { text: "Please process this request" },
  new MockJevBackend(() => ({ type: "noul", noul: 0.96 }))
);
```

## Node Fields

| Field | Description |
| --- | --- |
| `id` | Unique node ID in the graph |
| `version` | Node version, used for trace and cache isolation |
| `decisionId` | Fact key written to `run_state.facts` |
| `decisionType` | `noul`, `choice`, or `score` |
| `inputRefs` | Explicit input paths such as `input.text` and `facts.intent` |
| `confidenceThreshold` | Values below this threshold enter `fallbackNode` |
| `fallbackNode` | Required low-confidence fallback node |
| `scoreValues` | Optional mapping from score tiers to business values |
| `cache` | Optional content-addressed decision cache |

## Benchmark

The benchmark contains 10 realistic support-ticket routing cases:

- Refund escalation and ordinary invoice inquiry
- Login failure and data-sync delay
- Pricing inquiry and plan upgrade
- Spam closing
- Low-confidence relevance, ambiguous intent, and uncertain refund escalation to human review

Data and results are bound with MD5:

- `benchmark/tickets.md5` verifies the dataset version
- `benchmark/results.md5` verifies `results.json`
- `benchmark/report.md` provides a human-readable result

## Backend Contract

```js
async decide(question, context) {
  // question: noul/choice/score schema
  // return: { noul, choice, score, confidence, probabilities }
}
```

## Jev 决策图

[English](#jev-decision-graph) | [中文](#jev-决策图)

Jev Decision Graph 是一个 Node.js 运行时，用于把 Jev 风格的单步类型化决策组合成可靠的多步业务流程。它把路由、状态、置信度、可观测性和兜底策略都保留在显式代码中，而不是隐藏在一个巨大的 prompt 里。

这个项目解决的问题很实际：许多自动化任务并不是自由文本生成任务，而是类型化决策任务，例如请求是否相关、属于哪类意图、是否需要退款、优先级多高、结果是否足够可信以支持自动执行。Jev 风格的模型非常适合这些快速、类型安全的单步判断，但生产流程仍然需要编排层。这个项目提供的就是这一层。

## 项目与 Jev 的关系

“Jev” 指由 TypeSafe AI 推出的 System One Model，该公司由 ChatGPT 联合发明人 Diogo Almeida 创立。本项目是一个独立的开源编排层，用于串联 Jev 风格的类型化决策 API；它不是 TypeSafe AI 官方项目，也未获得 TypeSafe AI 的背书或隶属关系。

本项目刻意使用 “Jev-style” 这个表述，原因有两点：运行时按 Jev 暴露的 `noul`、`choice`、`score` 决策形态建模；同时保持后端无关，可以接入遵循同一类型化契约的其他决策模型。

## 为什么重要

传统 LLM 流水线经常把完整业务流程塞进一个大 prompt。这种做法难以审计、难以测试、排错成本高，而且一个早期错误可能沿着流程继续放大。Jev Decision Graph 把每个判断拆成类型化节点，并让节点之间的转移显式可控。

因此，整个流程更接近状态机，而不是聊天机器人。每个节点都有明确词表、置信度阈值和确定性兜底。每次执行都会生成 append-only trace，团队可以回放决策、对比模型版本，并在节点级别定位失败原因。

## 创新性

- **类型化决策图**：支持 `noul`、`choice`、`score` 三类决策，直接对应 Jev 风格模型的输出模式。
- **显式词表控制**：答案一旦超出声明的 `choice` 词表立即拒绝，防止类别漂移。
- **置信度感知转移**：每个节点必须声明兜底节点，低置信结果不能静默继续向后传递。
- **依赖式多步决策**：后续节点可以通过 `facts.*` 输入路径引用前面节点的事实。
- **score 插值映射**：可将档位下标映射为业务数值，例如 `-1..1` 的情绪分或优先级分。
- **append-only trace**：记录每步节点版本、决策值、置信度、概率、耗时和缓存状态。
- **确定性 benchmark**：内置 10 条真实工单路由场景，数据和结果通过 MD5 绑定，保证可复现。
- **后端抽象**：内置 Mock 后端用于开发测试，并提供 OpenRouter Jev 适配器用于真实调用。

## 快速开始

需要 Node.js 20+。

```bash
npm install
npm test
npm run benchmark
npm run benchmark:real
npm start
```

## 最小示例

```js
import { DecisionGraph, MockJevBackend } from "./src/index.js";

const graph = new DecisionGraph({
  name: "hello",
  version: "1.0.0",
  start: "is_relevant",
  maxDepth: 5,
  nodes: {
    is_relevant: {
      id: "is_relevant",
      decisionId: "is_relevant",
      decisionType: "noul",
      inputRefs: ["input.text"],
      confidenceThreshold: 0.8,
      fallbackNode: "human_review",
      buildQuestion: ({ "input.text": text }) => ({
        type: "noul",
        instructions: "这条请求是否需要处理？",
        criteria: { true: "需要处理", false: "无需处理" },
        text,
      }),
    },
  },
  terminals: {
    done: { result: { action: "auto" } },
    human_review: { result: { action: "review" } },
  },
  next: (state, output) => output.value ? "done" : "human_review",
});

const result = await graph.run(
  { text: "请处理这个请求" },
  new MockJevBackend(() => ({ type: "noul", noul: 0.96 }))
);
```

## 节点字段

| 字段 | 说明 |
| --- | --- |
| `id` | 图内唯一节点 ID |
| `version` | 节点版本，用于 trace 和缓存隔离 |
| `decisionId` | 写入 `run_state.facts` 的事实键 |
| `decisionType` | `noul`、`choice`、`score` |
| `inputRefs` | 显式输入路径，如 `input.text`、`facts.intent` |
| `confidenceThreshold` | 低于该阈值进入 `fallbackNode` |
| `fallbackNode` | 必填低置信兜底节点 |
| `scoreValues` | 可选，将档位下标映射为业务分数 |
| `cache` | 可选，按内容缓存决策 |

## Benchmark

内置 10 条真实工单路由场景，覆盖：

- 账单退款升级与普通发票咨询
- 登录故障与数据同步延迟
- 价格咨询与版本升级
- 垃圾广告关闭
- 低置信相关性、模糊意图、低置信退款转人工

数据与执行产物通过 MD5 绑定：

- `benchmark/tickets.md5` 校验数据集版本
- `benchmark/results.md5` 校验 `results.json`
- `benchmark/report.md` 输出人类可读结果

## 后端约定

```js
async decide(question, context) {
  // question: noul/choice/score schema
  // return: { noul, choice, score, confidence, probabilities }
}
```
