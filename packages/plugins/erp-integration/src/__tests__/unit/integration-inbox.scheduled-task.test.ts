import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    createIntegrationInboxBulkTask,
    createIntegrationInboxCriticalTask,
    createIntegrationInboxRetentionTask,
    createIntegrationInboxUserTask,
} from '../../integration-inbox.scheduled-task';
import {
    INBOX_BULK_BATCH_SIZE_DEFAULT,
    INBOX_BULK_STREAMS,
    INBOX_BULK_WALL_CLOCK_BUDGET_MS,
    INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
    INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    INBOX_RETENTION_WALL_CLOCK_BUDGET_MS,
    INBOX_USER_BATCH_SIZE_DEFAULT,
    INBOX_USER_STREAMS,
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
                user: 'usr',
                'promo-rule': 'pr2',
                'vat-rate': 'vr2',
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
            [...INBOX_ORDER_REGISTRATION_RESULT_STREAMS],
            INBOX_CRITICAL_BATCH_SIZE_DEFAULT,
        );
        expect(result).toEqual({ processed: 1, failed: 0 });
    });
});

// Issue #127: 'user' moved out of the bulk lane into its own dedicated lane (not merged into
// createIntegrationInboxCriticalTask above) so a large 'user' backlog can never starve
// order-registration-result the way 'counterparty' once starved 'user' in the bulk lane — see
// integration-inbox.scheduled-task.ts's own comment for the reasoning.
describe('createIntegrationInboxUserTask', () => {
    it('skips on a branch instance', async () => {
        const processPendingBatch = vi.fn();
        const task = createIntegrationInboxUserTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(processPendingBatch).not.toHaveBeenCalled();
    });

    it('claims only the user stream, at the user batch size, independent of the critical lane', async () => {
        const processPendingBatch = vi
            .fn()
            .mockResolvedValue({ processed: 1, failed: 0, claimed: 1 });
        const task = createIntegrationInboxUserTask(makeOptions('central'));
        const result = await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(processPendingBatch).toHaveBeenCalledTimes(1);
        expect(processPendingBatch).toHaveBeenCalledWith(
            [...INBOX_USER_STREAMS],
            INBOX_USER_BATCH_SIZE_DEFAULT,
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
            [...INBOX_BULK_STREAMS],
            INBOX_BULK_BATCH_SIZE_DEFAULT,
            expect.any(Number),
        );
        expect(result).toEqual({ processed: 2 * INBOX_BULK_BATCH_SIZE_DEFAULT + 3, failed: 0 });
    });

    // #149: the same deadline this loop checks between batches is also passed into
    // processPendingBatch so it can bound a single slow batch's own internal loop.
    it('passes the same deadline to every call within one execution', async () => {
        let now = 1_000_000;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const processPendingBatch = vi
            .fn()
            .mockResolvedValueOnce({
                processed: INBOX_BULK_BATCH_SIZE_DEFAULT,
                failed: 0,
                claimed: INBOX_BULK_BATCH_SIZE_DEFAULT,
            })
            .mockImplementationOnce(async () => {
                now += 1;
                return { processed: 3, failed: 0, claimed: 3 };
            });
        const task = createIntegrationInboxBulkTask(makeOptions('central'));

        await task.options.execute({
            injector: { get: () => ({ processPendingBatch }) } as never,
            scheduledContext: {} as never,
            params: {},
        });

        const firstDeadline = processPendingBatch.mock.calls[0][2];
        const secondDeadline = processPendingBatch.mock.calls[1][2];
        expect(firstDeadline).toBe(secondDeadline);
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

// #147: a separate lane, independent of the three claim lanes above — it only calls
// purgeSupersededProcessedRows, never processPendingBatch.
describe('createIntegrationInboxRetentionTask', () => {
    it('skips on a branch instance', async () => {
        const purgeSupersededProcessedRows = vi.fn();
        const task = createIntegrationInboxRetentionTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ purgeSupersededProcessedRows }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(purgeSupersededProcessedRows).not.toHaveBeenCalled();
    });

    it('tombstones superseded processed rows on a central instance, stopping once a call tombstones nothing', async () => {
        const purgeSupersededProcessedRows = vi
            .fn()
            .mockResolvedValueOnce(3)
            .mockResolvedValueOnce(0);
        const task = createIntegrationInboxRetentionTask(makeOptions('central'));
        const result = await task.options.execute({
            injector: { get: () => ({ purgeSupersededProcessedRows }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(purgeSupersededProcessedRows).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ tombstoned: 3 });
    });

    // mirrors createIntegrationInboxBulkTask's own wall-clock-budget test — a resync-sized
    // backlog of superseded groups must not keep this task's execute() running forever.
    it('stops looping once the wall-clock budget is spent, even if still tombstoning rows', async () => {
        let now = 0;
        vi.spyOn(Date, 'now').mockImplementation(() => now);
        const purgeSupersededProcessedRows = vi.fn().mockImplementation(async () => {
            now += INBOX_RETENTION_WALL_CLOCK_BUDGET_MS;
            return 5;
        });
        const task = createIntegrationInboxRetentionTask(makeOptions('central'));

        const result = await task.options.execute({
            injector: { get: () => ({ purgeSupersededProcessedRows }) } as never,
            scheduledContext: {} as never,
            params: {},
        });

        expect(purgeSupersededProcessedRows).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ tombstoned: 5 });
    });
});
