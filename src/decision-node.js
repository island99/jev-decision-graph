import { createHash } from "node:crypto";
import {
  DecisionBackendError,
  DecisionValidationError,
} from "./errors.js";
import {
  assertNonEmptyString,
  assertNumber,
  assertObject,
  assertProbability,
} from "./validation.js";

const DECISION_TYPES = new Set(["noul", "choice", "score"]);

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function resolvePath(root, path) {
  return path.split(".").reduce((current, segment) => {
    if (current === null || typeof current !== "object" || !(segment in current)) {
      throw new DecisionValidationError(`Input path does not exist: ${path}`);
    }
    return current[segment];
  }, root);
}

function normalizeCriteria(question) {
  const criteria = question.criteria;

  if (question.type === "choice") {
    assertObject(criteria, "choice criteria");
    const keys = Object.keys(criteria);
    if (keys.length < 2) {
      throw new DecisionValidationError("choice criteria must contain at least two options");
    }
    return keys;
  }

  if (question.type === "score") {
    if (!Array.isArray(criteria) || criteria.length < 2) {
      throw new DecisionValidationError("score criteria must contain at least two levels");
    }
    return criteria.map((level) => {
      assertNonEmptyString(level, "score level");
      return level;
    });
  }

  if (question.type === "noul") {
    return ["true", "false"];
  }

  throw new DecisionValidationError(`Unsupported decision type: ${question.type}`);
}

function normalizeProbabilities(probabilities, labels, selectedLabel) {
  if (probabilities !== undefined && probabilities !== null) {
    assertObject(probabilities, "probabilities");
    const keys = Object.keys(probabilities);
    if (keys.length !== labels.length || !labels.every((label) => keys.includes(label))) {
      throw new DecisionValidationError("probabilities must match the declared criteria");
    }
    for (const label of labels) {
      assertProbability(probabilities[label], `probability ${label}`);
    }
    return probabilities;
  }

  const selected = selectedLabel;
  const remaining = labels.filter((label) => label !== selected);
  const fallbackProbability = remaining.length === 0 ? 1 : 0.08 / remaining.length;
  const result = Object.fromEntries(labels.map((label) => [label, fallbackProbability]));
  result[selected] = 0.92;
  return result;
}

function questionValue(answer) {
  if (answer.type === "noul") return answer.noul >= 0.5 ? "true" : "false";
  if (answer.type === "choice") return answer.choice;
  return String(Math.round(answer.score));
}

function interpolatedScore(scoreIndex, scoreValues) {
  if (scoreValues.length === 0) return scoreIndex;
  if (scoreValues.length === 1) return scoreValues[0];

  const lower = Math.max(0, Math.min(scoreValues.length - 1, Math.floor(scoreIndex)));
  const upper = Math.min(scoreValues.length - 1, lower + 1);
  const weight = scoreIndex - lower;
  return scoreValues[lower] + (scoreValues[upper] - scoreValues[lower]) * weight;
}

export class DecisionNode {
  constructor(definition) {
    assertObject(definition, "decision node definition");
    assertNonEmptyString(definition.id, "node id");
    assertNonEmptyString(definition.decisionId, "decision id");
    assertNonEmptyString(definition.decisionType, "decision type");
    if (!DECISION_TYPES.has(definition.decisionType)) {
      throw new DecisionValidationError(`Unsupported decision type: ${definition.decisionType}`);
    }
    if (!Array.isArray(definition.inputRefs) || definition.inputRefs.length === 0) {
      throw new DecisionValidationError("inputRefs must be a non-empty array");
    }
    for (const inputRef of definition.inputRefs) {
      assertNonEmptyString(inputRef, "inputRef");
      if (!inputRef.startsWith("input.") && !inputRef.startsWith("facts.")) {
        throw new DecisionValidationError(
          "inputRef must start with input. or facts. (for example: input.ticket_text)"
        );
      }
    }
    if (typeof definition.buildQuestion !== "function") {
      throw new DecisionValidationError("buildQuestion must be a function");
    }
    if (!definition.fallbackNode) {
      throw new DecisionValidationError("Every decision node must define a fallbackNode");
    }
    if (definition.confidenceThreshold !== undefined) {
      assertProbability(definition.confidenceThreshold, "confidenceThreshold");
    }
    if (definition.scoreValues !== undefined) {
      if (!Array.isArray(definition.scoreValues) || definition.scoreValues.length < 2) {
        throw new DecisionValidationError("scoreValues must contain at least two values");
      }
      for (const scoreValue of definition.scoreValues) {
        assertNumber(scoreValue, "score value");
      }
    }

    this.id = definition.id;
    this.version = definition.version ?? 1;
    this.decisionId = definition.decisionId;
    this.decisionType = definition.decisionType;
    this.inputRefs = [...definition.inputRefs];
    this.buildQuestion = definition.buildQuestion;
    this.confidenceThreshold = definition.confidenceThreshold ?? 0.7;
    this.fallbackNode = definition.fallbackNode;
    this.scoreValues = definition.scoreValues;
    this.cache = definition.cache ?? false;
  }

  async execute(runState, backend, context) {
    assertObject(runState, "run state");
    assertObject(backend, "decision backend");
    if (typeof backend.decide !== "function") {
      throw new DecisionValidationError("Decision backend must implement decide(question)");
    }

    const resolvedInputs = Object.fromEntries(
      this.inputRefs.map((inputRef) => [inputRef, resolvePath(runState, inputRef)])
    );
    const question = this.buildQuestion(resolvedInputs, runState);
    assertObject(question, "question");
    assertNonEmptyString(question.type, "question type");
    if (question.type !== this.decisionType) {
      throw new DecisionValidationError(
        `Question type ${question.type} does not match node type ${this.decisionType}`
      );
    }
    assertNonEmptyString(question.instructions, "question instructions");

    const labels = normalizeCriteria(question);
    const cacheKey = this.cache ? stableHash({ node: this.id, version: this.version, question }) : null;
    const startedAt = new Date();

    if (cacheKey && context.cache?.has(cacheKey)) {
      const cached = context.cache.get(cacheKey);
      return { ...cached, cached: true, cache_key: cacheKey };
    }

    const rawAnswer = await backend.decide(question, {
      node: this,
      run_state: runState,
      resolved_inputs: resolvedInputs,
    });
    assertObject(rawAnswer, "backend answer");

    let value;
    let probabilities;
    let normalizedAnswer;

    if (this.decisionType === "noul") {
      assertProbability(rawAnswer.noul, "noul probability");
      normalizedAnswer = {
        type: "noul",
        noul: rawAnswer.noul,
        confidence: rawAnswer.confidence,
      };
      value = rawAnswer.noul >= 0.5;
      probabilities = {
        true: rawAnswer.probabilities?.true ?? rawAnswer.noul,
        false: rawAnswer.probabilities?.false ?? 1 - rawAnswer.noul,
      };
      if (probabilities.true < 0 || probabilities.true > 1) {
        throw new DecisionValidationError("noul probability must be between 0 and 1");
      }
    } else if (this.decisionType === "choice") {
      assertNonEmptyString(rawAnswer.choice, "choice value");
      if (!labels.includes(rawAnswer.choice)) {
        throw new DecisionBackendError(`Choice is outside the declared vocabulary: ${rawAnswer.choice}`);
      }
      normalizedAnswer = {
        type: "choice",
        choice: rawAnswer.choice,
        confidence: rawAnswer.confidence,
      };
      value = rawAnswer.choice;
      probabilities = normalizeProbabilities(rawAnswer.probabilities, labels, rawAnswer.choice);
    } else {
      assertNumber(rawAnswer.score, "score index");
      const maxIndex = labels.length - 1;
      const scoreIndex = Math.max(0, Math.min(maxIndex, rawAnswer.score));
      normalizedAnswer = {
        type: "score",
        score: scoreIndex,
        confidence: rawAnswer.confidence,
      };
      value = this.scoreValues
        ? interpolatedScore(scoreIndex, this.scoreValues)
        : scoreIndex;
      const selectedLabel = labels[Math.round(scoreIndex)];
      probabilities = normalizeProbabilities(rawAnswer.probabilities, labels, selectedLabel);
    }

    const confidence = Number.isFinite(Number(rawAnswer.confidence))
      ? Math.max(0, Math.min(1, Number(rawAnswer.confidence)))
      : Math.max(...Object.values(probabilities));

    const output = {
      node_id: this.id,
      node_version: this.version,
      decision_id: this.decisionId,
      decision_type: this.decisionType,
      value,
      confidence,
      probabilities,
      raw_answer: normalizedAnswer,
      criteria: question.criteria,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
      cached: false,
    };

    if (cacheKey) context.cache.set(cacheKey, output);
    return output;
  }
}
