# Installing the Jev Decision Graph Skill

This repository includes a cross-agent skill at:

```text
skill/jev-decision-graph-workflow/
```

## Codex

Copy the skill into your local Codex skills directory:

```bash
git clone https://github.com/island99/jev-decision-graph.git
mkdir -p ~/.codex/skills
cp -R jev-decision-graph/skill/jev-decision-graph-workflow ~/.codex/skills/
```

Restart Codex if your client does not discover newly copied skills automatically.

Then invoke it with:

```text
Use $jev-decision-graph-workflow to design [your workflow].
```

## Claude Code

Copy the same directory into your Claude Code skills location:

```bash
git clone https://github.com/island99/jev-decision-graph.git
cp -R jev-decision-graph/skill/jev-decision-graph-workflow [your-claude-skills-path]
```

The `SKILL.md` instructions are agent-neutral. The `CLAUDE.md` file notes that `agents/openai.yaml` is Codex-specific.

## Runtime Options

The skill is a workflow guide and template set. To execute generated code:

1. Use this repository directly.
2. Install it as a dependency once packaged.
3. Implement the compatible `decide(question, context)` backend contract in your own runtime.
