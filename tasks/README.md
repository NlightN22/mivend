# Tasks

Task briefs for continuing work in new chat sessions.

Each file contains everything a new Claude session needs to pick up the task:
project context, architecture decisions, what already exists, and the concrete goal.

## How to use

Open a new Claude Code session in `/projects/mivend` and paste the contents of the relevant
task file as the first message, or reference it:

```
Read tasks/<task-name>.md and implement it.
```

## Active tasks

| File                               | Goal                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| [sync-plugin.md](./sync-plugin.md) | Build plugin-sync: outbox + RabbitMQ + branch consumer |
| [ui-kit.md](./ui-kit.md)           | Build packages/ui-kit: Storybook + base components     |
