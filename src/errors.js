export class DecisionGraphError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "DecisionGraphError";
    this.details = details;
  }
}

export class DecisionValidationError extends DecisionGraphError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "DecisionValidationError";
  }
}

export class DecisionBackendError extends DecisionGraphError {
  constructor(message, details = {}) {
    super(message, details);
    this.name = "DecisionBackendError";
  }
}
