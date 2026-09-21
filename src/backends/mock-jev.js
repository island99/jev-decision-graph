import { DecisionBackendError } from "../errors.js";

export class MockJevBackend {
  constructor(resolver) {
    if (typeof resolver !== "function") {
      throw new Error("MockJevBackend requires a resolver(question, context) function");
    }
    this.resolver = resolver;
    this.calls = [];
  }

  async decide(question, context) {
    const answer = await this.resolver(question, context);
    if (answer === null || typeof answer !== "object") {
      throw new DecisionBackendError("Mock Jev resolver must return an answer object");
    }
    this.calls.push({ question, answer });
    return answer;
  }
}
