@AGENTS.md

## Claude Code rules

- Before making changes, read and follow AGENTS.md.
- If AGENTS.md conflicts with the current task, stop and ask.
- Do not ignore project conventions from AGENTS.md.

## Agent delegation

- Prefer a fresh agent (`general-purpose`, no inherited context) with a self-contained brief: link the
  issue, `AGENTS.md`, `docs/ai/PROJECT_CONTEXT.md`, the exact files and the acceptance checks.
- Use `subagent_type: "fork"` only when the task genuinely depends on the current conversation.
- Run at most 2 forks/agents in parallel.
