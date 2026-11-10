import { ScheduledTask } from '@vendure/core';

import { runAsIntegration, runAsSystem } from './change-journal-context';
import { isIntegrationTask } from './change-journal-sources';

// Task writes are journaled as system with the task id; ERP integration tasks are not journaled.
export function labelScheduledTasks(tasks: ScheduledTask[]): ScheduledTask[] {
    return tasks.map(
        task =>
            new ScheduledTask({
                ...task.options,
                execute: args =>
                    (isIntegrationTask(task.id) ? runAsIntegration : runAsSystem)(
                        `scheduled-task:${task.id}`,
                        () => task.options.execute(args),
                    ),
            }),
    );
}
