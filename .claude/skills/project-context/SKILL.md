---
name: project-context
description: Use when the user asks to summarize work, preserve project context, update project memory, prepare context for a new chat, or create a compact overview for future tasks.
---

# Project Context Skill

Maintain a compact global project context for future Claude Code sessions.

This is not only a task handoff. The purpose is to preserve the durable state of the project: what the project is, what has already been built, what decisions were made, what is planned next, and what important nuances must not be forgotten.

## Main output file

Always update:

- `docs/ai/PROJECT_CONTEXT.md`

Create the directory if it does not exist.

## What to preserve

The context file must include:

- Project purpose and product goal.
- Current high-level architecture.
- Main modules and their responsibilities.
- Important frontend decisions.
- Important backend decisions.
- Important database/schema/API decisions.
- What has already been implemented.
- What was changed recently.
- Current development status.
- Planned next work.
- Known problems, limitations, and technical debt.
- Important implementation nuances.
- Commands for linting, testing, building, and running the project.
- Things that should not be redone or reconsidered unless explicitly requested.
- Any business/product rules that directly affect implementation.

## What not to preserve

Do not include:

- Long logs.
- Full diffs.
- Temporary debugging noise.
- Rejected ideas unless they prevent repeated mistakes.
- Secrets, tokens, passwords, private keys, or credentials.
- Large historical narratives.
- Irrelevant chat discussion.

## Before updating

Inspect the project state when useful:

- `git status --short`
- `git diff --stat`
- `git diff --name-only`
- Existing `docs/ai/PROJECT_CONTEXT.md`
- Relevant documentation files
- Relevant package scripts, Makefile targets, or CI workflow files

Do not run expensive commands just to update the context.

## Anti-pattern review: synchronous processing of risky inbound events

Before finalizing the context update, scan the session's diff (`git diff --name-only`, plus
whatever the conversation touched) for a specific, recurring anti-pattern documented in
AGENTS.md's sync rules (rule #12): **a webhook, ERP/1C exchange callback, or any other
external/unreliable integration entry point that processes a critical event synchronously**,
instead of durably recording it first (a real inbox with a `pending`/`processing`/`processed`/
`failed` status, not a bare "seen" boolean) and processing it asynchronously via a retry-capable
worker.

Concretely, check any new or changed:

- REST `@Controller()` endpoint, GraphQL mutation, or event-bus subscriber that receives data
  from outside this platform (a payment provider, the ERP, a shipping provider, anything else
  external) and does NOT go through an inbox-style durable queue first.
- Any new "dedup" mechanism that marks an event as handled _at receipt time_ rather than _after
  processing actually completes_ — this silently reintroduces the same bug even if it looks like
  idempotency protection (real incident: `plugin-acquiring`'s original `ProcessedProviderEvent`/
  `recordIfNew`).

If you find a violation, do not silently fix it — flag it explicitly in the response to the user
and in the context file's "Known problems and limitations" section, referencing AGENTS.md rule
#12 and the reference implementation (`plugin-acquiring`'s `IncomingPaymentEvent`/`InboxService`/
`PaymentInboxProcessorService`/`PaymentInboxWorker`) as the pattern to follow.

This check costs nothing when nothing new touches an external integration boundary — skip it
quickly in that case rather than inventing a finding.

## Target format for docs/ai/PROJECT_CONTEXT.md

Use this structure:

- Project Context
    - Updated: YYYY-MM-DD HH:mm
- Project purpose
- Product direction
- Architecture
- Frontend
- Backend
- Database and data model
- API contracts
- Implemented so far
- Recent changes
- Planned next work
- Important nuances
- Known problems and limitations
- Commands
- Do not redo / do not forget

If a section has no useful information, keep it short instead of inventing content.

## Style

- Be compact.
- Be specific.
- Prefer facts over explanations.
- Write for a fresh Claude Code chat that has no previous conversation context.
- Keep the file useful for starting a new, different task in the same project.
- If the file already exists, update it instead of appending duplicate sections.
- Keep stable project context separate from temporary current-task details.
- Do not turn the context file into a changelog.

## Final verification

If code was changed during the session before updating the context, run the project verification commands when appropriate:

- `make lint`
- `make test`

If these commands are unavailable, inspect the project scripts and use the closest equivalent.

Do not claim verification passed unless it actually passed.

## Final response

After updating the file, respond with:

- The updated file path.
- A short summary of what changed in the context.
- Any important warning or next recommended step.
