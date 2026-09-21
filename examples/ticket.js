import { DecisionGraph, MockJevBackend } from "../src/index.js";

const intentLabels = {
  billing: "费用、账单、扣费、发票、退款",
  technical: "功能异常、故障、性能、数据问题",
  sales: "咨询产品、价格、方案",
  other: "其他问题",
};

const graph = new DecisionGraph({
  name: "ticket_router",
  version: "1.0.0",
  start: "is_relevant",
  maxDepth: 6,
  nodes: {
    is_relevant: {
      id: "is_relevant",
      decisionId: "is_relevant",
      decisionType: "noul",
      inputRefs: ["input.ticket_text"],
      confidenceThreshold: 0.8,
      fallbackNode: "human_review",
      buildQuestion: ({ "input.ticket_text": ticketText }) => ({
        type: "noul",
        instructions: "这条工单是否需要业务处理？",
        criteria: {
          true: "明确需要处理、反馈或解答",
          false: "闲聊、广告、测试或无需处理",
        },
        ticket_text: ticketText,
      }),
    },
    intent: {
      id: "intent",
      decisionId: "intent",
      decisionType: "choice",
      inputRefs: ["input.ticket_text"],
      confidenceThreshold: 0.75,
      fallbackNode: "human_review",
      buildQuestion: ({ "input.ticket_text": ticketText }) => ({
        type: "choice",
        instructions: "这条工单属于哪类意图？",
        criteria: intentLabels,
        ticket_text: ticketText,
      }),
    },
    refund_check: {
      id: "refund_check",
      decisionId: "needs_refund",
      decisionType: "noul",
      inputRefs: ["input.ticket_text", "facts.intent"],
      confidenceThreshold: 0.8,
      fallbackNode: "human_review",
      buildQuestion: ({ "input.ticket_text": ticketText, "facts.intent": intent }) => ({
        type: "noul",
        instructions: "这条账单类工单是否涉及退款？",
        criteria: {
          true: "用户要求退款或对扣费提出争议",
          false: "仅咨询账单、发票或扣费明细",
        },
        ticket_text: ticketText,
        known_intent: intent.value,
      }),
    },
  },
  terminals: {
    close_not_relevant: {
      result: { action: "close", reason: "not_relevant" },
    },
    route_billing: {
      result: { action: "route", queue: "billing" },
    },
    route_refund: {
      result: { action: "route", queue: "billing_refund", priority: "high" },
    },
    route_technical: {
      result: { action: "route", queue: "technical" },
    },
    route_sales: {
      result: { action: "route", queue: "sales" },
    },
    route_other: {
      result: { action: "route", queue: "general" },
    },
    human_review: {
      result: { action: "human_review", reason: "low_confidence" },
    },
  },
  next(state, output) {
    if (output.decision_id === "is_relevant" && output.value === false) {
      return "close_not_relevant";
    }
    if (output.decision_id === "is_relevant") return "intent";
    if (output.decision_id === "intent" && output.value === "billing") return "refund_check";
    if (output.decision_id === "intent" && output.value === "technical") return "route_technical";
    if (output.decision_id === "intent" && output.value === "sales") return "route_sales";
    if (output.decision_id === "intent") return "route_other";
    if (output.decision_id === "needs_refund" && output.value === true) return "route_refund";
    if (output.decision_id === "needs_refund") return "route_billing";
    return "human_review";
  },
});

function mockAnswer(question) {
  if (question.type === "noul") {
    const value = /退款|退钱|多扣/.test(question.ticket_text ?? "") ? true : true;
    return { type: "noul", noul: value ? 0.96 : 0.04 };
  }

  if (question.type === "choice") {
    if (/退款|退钱|多扣|扣费|账单|发票/.test(question.ticket_text)) {
      return { type: "choice", choice: "billing", confidence: 0.94 };
    }
    if (/报错|失败|异常|无法|卡/.test(question.ticket_text)) {
      return { type: "choice", choice: "technical", confidence: 0.91 };
    }
    if (/价格|方案|开通|咨询/.test(question.ticket_text)) {
      return { type: "choice", choice: "sales", confidence: 0.88 };
    }
    return { type: "choice", choice: "other", confidence: 0.86 };
  }

  throw new Error("Unsupported mock question type");
}

const result = await graph.run(
  { ticket_text: "你们昨天多扣了我两次费用，我要求退款。" },
  new MockJevBackend(mockAnswer)
);

console.log(JSON.stringify({
  status: result.status,
  terminal: result.terminal,
  result: result.result,
  trace: result.run_state.trace.map((item) => ({
    step: item.step + 1,
    node_id: item.node_id,
    decision_id: item.output.decision_id,
    value: item.output.value,
    confidence: item.output.confidence,
  })),
}, null, 2));
