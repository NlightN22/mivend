import { describe, expect, it } from 'vitest';
import { ScheduledTask } from '@vendure/core';
import type { ScheduledTaskExecutionArgs } from '@vendure/core';

import { currentChangeScope, runAsSystem } from '../../change-journal-context';
import { labelScheduledTasks } from '../../scheduled-task-source';

describe('labelScheduledTasks', () => {
    it('runs each task inside a system scope labelled with the task id', async () => {
        const task = new ScheduledTask({
            id: 'reservation-expiry',
            schedule: '* * * * *',
            execute: async () => {
                const scope = currentChangeScope();
                return {
                    source: scope?.source,
                    actor: await scope?.resolveActor({ query: async () => [] }),
                };
            },
        });
        const [wrapped] = labelScheduledTasks([task]);
        expect(wrapped.id).toBe(task.id);
        expect(wrapped.options.schedule).toBe('* * * * *');
        const result: unknown = await wrapped.options.execute({} as ScheduledTaskExecutionArgs);
        expect(result).toEqual({
            source: 'scheduled-task:reservation-expiry',
            actor: { actorType: 'system', userId: null, administratorId: null },
        });
        expect(currentChangeScope()).toBeUndefined();
    });

    it.each([
        ['erp-integration-inbox-bulk', false],
        ['erp-integration-category-tree-recompute', false],
        ['sync-erp-poll', false],
        ['external-order-counterparty-reconcile', false],
        ['reservation-expiry', true],
        ['change-journal-cleanup', true],
    ])('task %s journaled: %s', async (id, journaled) => {
        const task = new ScheduledTask({
            id,
            schedule: '* * * * *',
            execute: async () => currentChangeScope()?.journaled,
        });
        const [wrapped] = labelScheduledTasks([task]);
        expect(await wrapped.options.execute({} as ScheduledTaskExecutionArgs)).toBe(journaled);
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
