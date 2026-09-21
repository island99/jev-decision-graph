import { DecisionValidationError } from "./errors.js";

export function assertObject(value, name) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DecisionValidationError(`${name} must be an object`);
  }
}

export function assertNonEmptyString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DecisionValidationError(`${name} must be a non-empty string`);
  }
}

export function assertNumber(value, name) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DecisionValidationError(`${name} must be a finite number`);
  }
}

export function assertProbability(value, name) {
  assertNumber(value, name);
  if (value < 0 || value > 1) {
    throw new DecisionValidationError(`${name} must be between 0 and 1`);
  }
}
