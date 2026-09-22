import { describe, expect, it, vi } from 'vitest';
import { ConfigService, CollectionService } from '@vendure/core';

import { createCollectionFiltersRecomputeTask } from '../../collection-filters-recompute.scheduled-task';
import type { ErpIntegrationPluginOptions } from '../../types';

// A strategy shaped enough to satisfy isInspectableJobQueueStrategy's own duck-typing check
// (findOne/findMany/findManyById/removeSettledJobs all present).
function makeInjector(
    triggerApplyFiltersJob: ReturnType<typeof vi.fn>,
    findMany: ReturnType<typeof vi.fn>,
): { get: (token: unknown) => unknown } {
    const services = new Map<unknown, unknown>([
        [
            ConfigService,
            {
                jobQueueOptions: {
                    jobQueueStrategy: {
                        findOne: vi.fn(),
                        findMany,
                        findManyById: vi.fn(),
                        removeSettledJobs: vi.fn(),
                    },
                },
            },
        ],
        [CollectionService, { triggerApplyFiltersJob }],
    ]);
    return { get: (token: unknown) => services.get(token) };
}

function makeOptions(
    instanceType: 'central' | 'branch',
    kafkaEnabled = true,
): ErpIntegrationPluginOptions {
    return {
        instanceType,
        kafkaEnabled,
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

// Exercises the task's own config.execute() directly rather than the real ScheduledTask.execute()
// wrapper (which builds scheduledContext itself via RequestContextService/ChannelService — that's
// Vendure core's own already-tested plumbing, not ours to re-verify here).
describe('createCollectionFiltersRecomputeTask', () => {
    it('skips on a branch instance', async () => {
        const triggerApplyFiltersJob = vi.fn();
        const task = createCollectionFiltersRecomputeTask(makeOptions('branch'));
        const result = await task.options.execute({
            injector: { get: () => ({ triggerApplyFiltersJob }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(triggerApplyFiltersJob).not.toHaveBeenCalled();
    });

    it('skips when kafkaEnabled is false, even on a central instance', async () => {
        const triggerApplyFiltersJob = vi.fn();
        const task = createCollectionFiltersRecomputeTask(makeOptions('central', false));
        const result = await task.options.execute({
            injector: { get: () => ({ triggerApplyFiltersJob }) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(result).toEqual({ skipped: true });
        expect(triggerApplyFiltersJob).not.toHaveBeenCalled();
    });

    it('triggers exactly one batched recompute when no previous sweep is still unsettled', async () => {
        const triggerApplyFiltersJob = vi.fn().mockResolvedValue(undefined);
        const findMany = vi.fn().mockResolvedValue({ items: [], totalItems: 0 });
        const task = createCollectionFiltersRecomputeTask(makeOptions('central', true));
        const scheduledContext = { fake: 'ctx' };
        const result = await task.options.execute({
            injector: makeInjector(triggerApplyFiltersJob, findMany) as never,
            scheduledContext: scheduledContext as never,
            params: {},
        });
        expect(findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                filter: expect.objectContaining({
                    queueName: { eq: 'apply-collection-filters' },
                    isSettled: { eq: false },
                }),
            }),
        );
        expect(triggerApplyFiltersJob).toHaveBeenCalledTimes(1);
        expect(triggerApplyFiltersJob).toHaveBeenCalledWith(scheduledContext);
        expect(result).toEqual({ triggered: true });
    });

    // Real incident, 2026-09-20: apply-collection-filters has no idempotency of its own
    // (upstream Vendure gap, vendurehq/vendure#5280 — concurrent runs silently collide on the
    // Collection<->ProductVariant junction table). Several full sweeps piled up because this
    // task fired every 3 minutes regardless of whether the previous sweep (sometimes ~44 minutes
    // for this project's real catalog) had finished.
    it('skips triggering a new sweep while a previous one has not settled yet', async () => {
        const triggerApplyFiltersJob = vi.fn();
        const findMany = vi.fn().mockResolvedValue({ items: [{ id: 'job-1' }], totalItems: 1 });
        const task = createCollectionFiltersRecomputeTask(makeOptions('central', true));
        const result = await task.options.execute({
            injector: makeInjector(triggerApplyFiltersJob, findMany) as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(triggerApplyFiltersJob).not.toHaveBeenCalled();
        expect(result).toEqual({ skipped: true, reason: 'previous sweep still running' });
    });

    it('triggers anyway if the job queue strategy is not inspectable (no findMany etc.)', async () => {
        const triggerApplyFiltersJob = vi.fn().mockResolvedValue(undefined);
        const task = createCollectionFiltersRecomputeTask(makeOptions('central', true));
        const services = new Map<unknown, unknown>([
            [ConfigService, { jobQueueOptions: { jobQueueStrategy: {} } }],
            [CollectionService, { triggerApplyFiltersJob }],
        ]);
        const result = await task.options.execute({
            injector: { get: (token: unknown) => services.get(token) } as never,
            scheduledContext: {} as never,
            params: {},
        });
        expect(triggerApplyFiltersJob).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ triggered: true });
    });
});
