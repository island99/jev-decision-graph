# Jev Decision Graph

一个用于把 Jev 风格“单步类型化决策”串联成多步决策图的 Node.js 运行时。

## 核心能力

- `noul` / `choice` / `score` 三类类型化决策节点
- 显式 DAG 路由：宿主代码根据输出值决定下一个节点
- 低置信强制兜底：每个节点必须声明 `fallbackNode`
- append-only trace：记录每步节点版本、输入输出、概率、置信度和耗时
- 决策缓存：按节点版本和问题内容生成缓存键
- Mock Jev 后端与 OpenRouter Jev 后端适配器

## 快速开始

```bash
npm install
npm start
npm test
npm run benchmark
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
        instructions: "是否需要处理",
        criteria: { true: "需要", false: "不需要" },
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
  { text: "需要处理" },
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
| `inputRefs` | 显式输入引用，如 `input.text`、`facts.intent` |
| `confidenceThreshold` | 低于该值进入 `fallbackNode` |
| `fallbackNode` | 必填，低置信兜底节点 |
| `scoreValues` | `score` 可选，把档位下标插值为业务分数 |
| `cache` | 可选，开启后按节点版本和问题内容缓存 |

## Benchmark

`benchmark/tickets.json` 提供 10 条真实工单路由场景，覆盖：

- 账单退款升级与普通发票咨询
- 登录故障与数据同步延迟
- 价格咨询与版本升级
- 垃圾广告关闭
- 低置信相关性、模糊意图、低置信退款转人工

数据与执行产物通过 MD5 绑定：

- `benchmark/tickets.md5` 校验数据集版本
- `benchmark/results.md5` 校验 `results.json`
- `benchmark/report.md` 输出人类可读结果

```bash
npm run benchmark
```

## Jev 后端约定

Mock 后端用于开发和测试。真实后端需实现：

```js
async decide(question, context) {
  // question: noul/choice/score schema
  // return: { noul, choice, score, confidence, probabilities }
}
``+

`OpenRouterJevBackend` 通过 `OPENROUTER_API_KEY` 对应的 API key 参数调用：

```js
import { OpenRouterJevBackend } from "./src/index.js";

const backend = new OpenRouterJevBackend({
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "typesafe/jev-1.13",
});
```
