import { DecisionGraphError, DecisionValidationError } from "./errors.js";
import { DecisionNode } from "./decision-node.js";
import { assertNonEmptyString, assertObject } from "./validation.js";

export class DecisionGraph {
  constructor(definition) {
    assertObject(definition, "graph definition");
    assertNonEmptyString(definition.name, "graph name");
    assertNonEmptyString(definition.version, "graph version");
    assertNonEmptyString(definition.start, "start node");
    assertObject(definition.nodes, "graph nodes");
    assertObject(definition.terminals, "graph terminals");
    if (typeof definition.next !== "function") {
      throw new DecisionValidationError("Graph must define a next(state, output) function");
    }
    if (!Number.isInteger(definition.maxDepth) || definition.maxDepth < 1) {
      throw new DecisionValidationError("maxDepth must be a positive integer");
    }

    this.name = definition.name;
    this.version = definition.version;
    this.start = definition.start;
    this.maxDepth = definition.maxDepth;
    this.next = definition.next;
    this.nodes = new Map(
      Object.entries(definition.nodes).map(([id, nodeDefinition]) => {
        const node = nodeDefinition instanceof DecisionNode
          ? nodeDefinition
          : new DecisionNode(nodeDefinition);
        if (node.id !== id) {
          throw new DecisionValidationError(`Node id mismatch: expected ${id}, received ${node.id}`);
        }
        return [id, node];
      })
    );
    this.terminals = new Map(Object.entries(definition.terminals));

    if (!this.nodes.has(this.start)) {
      throw new DecisionValidationError(`Start node does not exist: ${this.start}`);
    }
    for (const node of this.nodes.values()) {
      if (node.fallbackNode && !this.terminals.has(node.fallbackNode) && !this.nodes.has(node.fallbackNode)) {
        throw new DecisionValidationError(`Fallback node does not exist: ${node.fallbackNode}`);
      }
    }
    for (const [id, terminal] of this.terminals) {
      if (terminal !== null && typeof terminal !== "object") {
        throw new DecisionValidationError(`Terminal ${id} must be an object`);
      }
      if (terminal.resolve !== undefined && typeof terminal.resolve !== "function") {
        throw new DecisionValidationError(`Terminal ${id} resolve must be a function`);
      }
    }
  }

  async run(input, backend, options = {}) {
    assertObject(input, "graph input");
    assertObject(backend, "graph backend");
    assertObject(options, "graph run options");
    const runState = {
      run_id: options.runId ?? crypto.randomUUID(),
      graph_name: this.name,
      graph_version: this.version,
      input,
      facts: {},
      trace: [],
      started_at: new Date().toISOString(),
    };
    const context = {
      cache: options.cache instanceof Map ? options.cache : new Map(),
      signal: options.signal,
    };
    let currentNode = this.start;

    for (let depth = 0; depth < this.maxDepth; depth += 1) {
      if (this.terminals.has(currentNode)) {
        const terminal = this.terminals.get(currentNode);
        const result = terminal.resolve ? terminal.resolve(runState) : terminal.result;
        runState.finished_at = new Date().toISOString();
        return {
          status: "completed",
          terminal: currentNode,
          result,
          run_state: runState,
        };
      }

      const node = this.nodes.get(currentNode);
      if (!node) {
        throw new DecisionGraphError(`Graph route returned an unknown node: ${currentNode}`, {
          run_state: runState,
        });
      }

      const output = await node.execute(runState, backend, context);
      runState.facts[output.decision_id] = output;
      runState.trace.push({
        step: runState.trace.length,
        node_id: node.id,
        output,
      });

      currentNode = output.confidence < node.confidenceThreshold
        ? node.fallbackNode ?? this.next(runState, output)
        : this.next(runState, output);
    }

    throw new DecisionGraphError(`Graph exceeded maxDepth of ${this.maxDepth}`, {
      run_state: runState,
    });
  }
}
