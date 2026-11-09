import { ScheduledTask } from '@vendure/core';

import { runAsSystem } from './change-journal-context';

// Writes made by a scheduled task (the ERP inbox lanes included) are journaled as system with the task id.
export function labelScheduledTasks(tasks: ScheduledTask[]): ScheduledTask[] {
    return tasks.map(
        task =>
            new ScheduledTask({
                ...task.options,
                execute: args =>
                    runAsSystem(`scheduled-task:${task.id}`, () => task.options.execute(args)),
            }),
    );
}
