import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createIntegrationInboxBulkTask,
    createIntegrationInboxCriticalTask,
} from '../../integration-inbox.scheduled-task';
import {
    INBOX_BULK_BATCH_SIZE_DEFAULT,
    INBOX_BULK_STREAMS,
    INBOX_BULK_WALL_CLOCK_BUDGET_MS,
    INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
    INBOX_CRITICAL_STREAMS,
} from '../../types';
import type { ErpIntegrationPluginOptions } from '../../types';

function makeOptions(instanceType: 'central' | 'branch'): ErpIntegrationPluginOptions {
    return {
        instanceType,
        kafka: { brokers: ['x'], clientId: 'x', topic: 'x' },
        kafkaConsumer: {
            brokers: ['x'],
            clientId: 'x',
            groupId: 'x',
            topics: {
                category: 'c',
                organization: 'o',
                warehouse: 'w',
                'price-type': 'pt',
                product: 'p',
                offer: 'of',
                price: 'pr',
                stock: 's',
                'storage-location': 'sl',
                'stock-organization': 'so',
                'order-registration-result': 'orr',
                'order-changed': 'oc',
                department: 'dept',
                counterparty: 'cp',
                'counterparty-credit-balance': 'cpcb',
            },
        },
        schemaRegistry: { url: 'http://x' },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
});

// Issue #93: mirrors createReconciliationTask's own gating-test shape.
describe('createIntegrationInboxCriticalTask', () => {
    it('skips on a branch instance', async () => {
        const processPendingBatch = vi.fn();
        const task = createIntegrationInboxCriticalTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(processPendingBatch).not.toHaveBeenCalled();
    });

    it('claims only the critical streams, at the critical batch size, on a central instance', async () => {
        const processPendingBatch = vi
            .fn()
            .mockResolvedValue({ processed: 1, failed: 0, claimed: 1 });
        const task = createIntegrationInboxCriticalTask(makeOptions('central'));
        const result = await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(processPendingBatch).toHaveBeenCalledTimes(1);
        expect(processPendingBatch).toHaveBeenCalledWith(
            undefined,
            [...INBOX_CRITICAL_STREAMS],
            INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
        );
        expect(result).toEqual({ processed: 1, failed: 0 });
    });
});

describe('createIntegrationInboxBulkTask', () => {
    it('skips on a branch instance', async () => {
        const processPendingBatch = vi.fn();
        const task = createIntegrationInboxBulkTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(processPendingBatch).not.toHaveBeenCalled();
    });

    it('reclaims immediately while a batch comes back full, stopping once a batch is partial', async () => {
        const processPendingBatch = vi
            .fn()
            .mockResolvedValueOnce({
                processed: INBOX_BULK_BATCH_SIZE_DEFAULT,
                failed: 0,
                claimed: INBOX_BULK_BATCH_SIZE_DEFAULT,
            })
            .mockResolvedValueOnce({
                processed: INBOX_BULK_BATCH_SIZE_DEFAULT,
                failed: 0,
                claimed: INBOX_BULK_BATCH_SIZE_DEFAULT,
            })
            .mockResolvedValueOnce({ processed: 3, failed: 0, claimed: 3 });
        const task = createIntegrationInboxBulkTask(makeOptions('central'));

        const result = await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });

        expect(processPendingBatch).toHaveBeenCalledTimes(3);
        expect(processPendingBatch).toHaveBeenCalledWith(
            undefined,
            [...INBOX_BULK_STREAMS],
            INBOX_BULK_BATCH_SIZE_DEFAULT,
        );
        expect(result).toEqual({ processed: 2 * INBOX_BULK_BATCH_SIZE_DEFAULT + 3, failed: 0 });
    });

    // mivend.audit.90's review of issue #93 (MEDIUM-HIGH): the reclaim loop must bound itself by
    // wall-clock even when every batch keeps coming back full, so one execution can never run
    // long enough to hit the scheduler's own task timeout (a timed-out task's execute() promise
    // keeps running orphaned in the background — see the scheduled-task file's own comment).
    it('stops reclaiming once the wall-clock budget is spent, even if the batch is still full', async () => {
        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const processPendingBatch = vi.fn().mockImplementation(async () => {
            now += INBOX_BULK_WALL_CLOCK_BUDGET_MS;
            return {
                processed: INBOX_BULK_BATCH_SIZE_DEFAULT,
                failed: 0,
                claimed: INBOX_BULK_BATCH_SIZE_DEFAULT,
            };
        });
        const task = createIntegrationInboxBulkTask(makeOptions('central'));

        await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });

        // The first call always runs; it alone pushes elapsed time to the budget, so the
        // post-processing budget check stops the loop before a second call.
        expect(processPendingBatch).toHaveBeenCalledTimes(1);
    });
});
