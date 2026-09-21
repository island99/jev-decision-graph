# Jev Decision Graph Workflow for Claude Code

Use the instructions in `SKILL.md` when the user asks to design or implement a Jev-style decision workflow.

For Claude Code, this folder is self-contained. The `SKILL.md` instructions apply directly; the `agents/openai.yaml` file is Codex-specific and can be ignored.

## Recommended installation

Copy this directory into your Claude Code skills location, or reference it from your project. The templates and workflow rules do not require Codex-specific tooling.

## Runtime

The template imports from `jev-decision-graph`. Either:

1. Use the runtime repository: https://github.com/island99/jev-decision-graph
2. Implement the same backend contract:

```js
async decide(question, context) {
  // return { noul } | { choice, confidence, probabilities? } |
  //        { score, confidence, probabilities? }
}
```
