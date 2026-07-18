@AGENTS.md

## Claude Code rules

- Before making changes, read and follow AGENTS.md.
- If AGENTS.md conflicts with the current task, stop and ask.
- Do not ignore project conventions from AGENTS.md.

## Agent delegation override (this project only)

This is a large, heavy monorepo. The global rule "always use subagent_type: fork for
implementation" has repeatedly caused the session to exhaust memory and crash (multiple times in
one session) when forks inherit this project's very long conversation context. For THIS project,
override the global default:

- Prefer `subagent_type: "general-purpose"` (a fresh agent, no inherited context) over `"fork"`
  for implementation tasks, unless the task genuinely needs the parent's full conversation
  context to do the work correctly (rare — most implementation tasks here are well-scoped enough
  to be fully self-contained in the prompt).
- Give fresh agents a self-contained prompt: point them at AGENTS.md, the relevant files/plugins,
  and the exact task — don't assume they know anything from this conversation.
- Default to a lighter/cheaper model for these agents (e.g. `haiku` or `fable`) unless the task is
  complex enough to clearly need full Sonnet-level reasoning — pass `model` explicitly.
- Avoid running more than 1-2 substantial forks/agents in parallel in this project, especially
  late in a long session — see the `feedback_fork_context_overload` memory entry.
