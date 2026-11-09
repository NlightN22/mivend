import { describe, expect, it } from 'vitest';
import { ScheduledTask } from '@vendure/core';
import type { ScheduledTaskExecutionArgs } from '@vendure/core';

import { currentChangeScope, runAsSystem } from '../../change-journal-context';
import { labelScheduledTasks } from '../../scheduled-task-source';

describe('labelScheduledTasks', () => {
    it('runs each task inside a system scope labelled with the task id', async () => {
        const task = new ScheduledTask({
            id: 'erp-integration-inbox-bulk',
            schedule: '* * * * *',
            execute: async () => {
                const scope = currentChangeScope();
                return { source: scope?.source, actor: await scope?.resolveActor() };
            },
        });
        const [wrapped] = labelScheduledTasks([task]);
        expect(wrapped.id).toBe(task.id);
        expect(wrapped.options.schedule).toBe('* * * * *');
        const result: unknown = await wrapped.options.execute({} as ScheduledTaskExecutionArgs);
        expect(result).toEqual({
            source: 'scheduled-task:erp-integration-inbox-bulk',
            actor: { actorType: 'system', userId: null, administratorId: null },
        });
        expect(currentChangeScope()).toBeUndefined();
    });

    it('scopes do not leak between concurrent runs', async () => {
        const seen = await Promise.all(
            ['a', 'b'].map(label =>
                runAsSystem(label, async () => {
                    await new Promise(r => setImmediate(r));
                    return currentChangeScope()?.source;
                }),
            ),
        );
        expect(seen).toEqual(['a', 'b']);
    });
});
