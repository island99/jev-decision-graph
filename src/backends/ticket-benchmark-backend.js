import { MockJevBackend } from "./mock-jev.js";

function isRelevant(text, id) {
  if (id === "spam_ad") return { type: "noul", noul: 0.03 };
  if (id === "low_relevance") return { type: "noul", noul: 0.74 };
  return { type: "noul", noul: 0.96 };
}

function intent(text, id) {
  const byId = {
    refund_escalation: ["billing", 0.94],
    invoice_query: ["billing", 0.93],
    login_failure: ["technical", 0.92],
    sync_delay: ["technical", 0.91],
    pricing_inquiry: ["sales", 0.9],
    renewal_inquiry: ["sales", 0.89],
    ambiguous_intent: ["billing", 0.62],
    refund_low_confidence: ["billing", 0.9],
  };
  const [choice, confidence] = byId[id] ?? ["other", 0.88];
  return { type: "choice", choice, confidence };
}

function refund(text, id) {
  if (id === "invoice_query") return { type: "noul", noul: 0.08 };
  if (id === "refund_low_confidence") {
    return { type: "noul", noul: 0.93, confidence: 0.69 };
  }
  return { type: "noul", noul: 0.97 };
}

export class TicketBenchmarkBackend extends MockJevBackend {
  constructor() {
    super((question, context) => {
      const input = context.run_state.input;
      if (question.type === "noul" && question.instructions.includes("是否需要业务处理")) {
        return isRelevant(input.ticket_text, input.id);
      }
      if (question.type === "choice") return intent(input.ticket_text, input.id);
      if (question.type === "noul" && question.instructions.includes("是否涉及退款")) {
        return refund(input.ticket_text, input.id);
      }
      throw new Error(`No benchmark answer for question: ${question.instructions}`);
    });
  }
}
