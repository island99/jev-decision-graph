import { MockJevBackend } from "../src/index.js";
import { createTicketRouterGraph } from "../src/ticket-graph.js";

const graph = createTicketRouterGraph();

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
