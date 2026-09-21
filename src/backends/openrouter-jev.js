import { DecisionBackendError } from "../errors.js";

export class OpenRouterJevBackend {
  constructor(options = {}) {
    this.model = options.model ?? "typesafe/jev-1.13";
    this.baseUrl = (options.baseUrl ?? "https://openrouter.ai/api").replace(/\/+$/, "");
    this.apiKey = options.apiKey;

    if (!this.apiKey) {
      throw new Error("OpenRouterJevBackend requires options.apiKey");
    }
  }

  async decide(question, context) {
    const response = await fetch(`${this.baseUrl}/alpha/decisions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        state: context.run_state,
        questions: {
          [`${context.node.id}_v${context.node.version}`]: question,
        },
        ...(this.extraBody ?? {}),
      }),
      signal: context.signal,
    });

    const json = await response.json().catch(() => null);
    if (!response.ok) {
      throw new DecisionBackendError(`OpenRouter Jev request failed: ${response.status}`, {
        status: response.status,
        response: json,
      });
    }

    const answer = json?.answers?.[`${context.node.id}_v${context.node.version}`];
    if (!answer) {
      throw new DecisionBackendError("OpenRouter Jev response is missing the answer");
    }
    return answer;
  }

  static sanitizeRunStateForBenchmark(runState) {
    const sanitized = structuredClone(runState);
    sanitized.input = Object.fromEntries(
      Object.entries(sanitized.input ?? {}).filter(([key]) =>
        ["id", "ticket_text"].includes(key)
      )
    );
    return sanitized;
  }
}
