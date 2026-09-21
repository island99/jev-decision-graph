import { DecisionGraph, MockJevBackend } from "../../../src/index.js";

export function createDecisionGraph() {
  return new DecisionGraph({
    name: "typed_decision_workflow",
    version: "1.0.0",
    start: "is_relevant",
    maxDepth: 8,
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
          instructions: "Is this input relevant to the target workflow?",
          criteria: {
            true: "The input clearly belongs to this workflow",
            false: "The input is unrelated, spam, or does not require handling",
          },
          text,
        }),
      },
      primary_category: {
        id: "primary_category",
        decisionId: "primary_category",
        decisionType: "choice",
        inputRefs: ["input.text", "facts.is_relevant"],
        confidenceThreshold: 0.75,
        fallbackNode: "human_review",
        buildQuestion: ({ "input.text": text, "facts.is_relevant": relevance }) => ({
          type: "choice",
          instructions: "Select the primary category.",
          criteria: {
            category_a: "Describe category A",
            category_b: "Describe category B",
            category_c: "Describe category C",
          },
          text,
          known_relevance: relevance.value,
        }),
      },
      dependent_check: {
        id: "dependent_check",
        decisionId: "needs_followup",
        decisionType: "noul",
        inputRefs: ["input.text", "facts.primary_category"],
        confidenceThreshold: 0.8,
        fallbackNode: "human_review",
        buildQuestion: ({ "input.text": text, "facts.primary_category": category }) => ({
          type: "noul",
          instructions: "Does this item require a follow-up action?",
          criteria: {
            true: "A concrete follow-up is required",
            false: "No follow-up is required",
          },
          text,
          known_category: category.value,
        }),
      },
    },
    terminals: {
      close_not_relevant: {
        result: { action: "close", reason: "not_relevant" },
      },
      route_category_a: {
        result: { action: "route", queue: "category_a" },
      },
      route_category_b: {
        result: { action: "route", queue: "category_b" },
      },
      route_followup: {
        result: { action: "route", queue: "followup", priority: "high" },
      },
      human_review: {
        result: { action: "human_review", reason: "low_confidence" },
      },
    },
    next(state, output) {
      if (output.decision_id === "is_relevant" && output.value === false) {
        return "close_not_relevant";
      }
      if (output.decision_id === "is_relevant") return "primary_category";
      if (output.decision_id === "primary_category") {
        if (output.value === "category_a") return "route_category_a";
        if (output.value === "category_b") return "dependent_check";
        return "human_review";
      }
      if (output.decision_id === "needs_followup" && output.value === true) return "route_followup";
      if (output.decision_id === "needs_followup" && output.value === false) return "route_category_b";
      return "human_review";
    },
  });
}

const backend = new MockJevBackend((question) => {
  if (question.type === "noul") return { type: "noul", noul: 0.92 };
  return { type: "choice", choice: "category_b", confidence: 0.91 };
});

const result = await createDecisionGraph().run({ text: "example input" }, backend);
console.log(JSON.stringify({
  terminal: result.terminal,
  result: result.result,
  trace: result.run_state.trace.map((item) => ({
    node_id: item.node_id,
    value: item.output.value,
    confidence: item.output.confidence,
  })),
}, null, 2));
