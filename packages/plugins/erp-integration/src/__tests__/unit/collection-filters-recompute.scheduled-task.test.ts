import { describe, expect, it, vi } from 'vitest';

import { createCollectionFiltersRecomputeTask } from '../../collection-filters-recompute.scheduled-task';
import type { ErpIntegrationPluginOptions } from '../../types';

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

    it('triggers exactly one batched recompute on a central instance with Kafka enabled', async () => {
        const triggerApplyFiltersJob = vi.fn().mockResolvedValue(undefined);
        const task = createCollectionFiltersRecomputeTask(makeOptions('central', true));
        const scheduledContext = { fake: 'ctx' };
        const result = await task.options.execute({
            injector: { get: () => ({ triggerApplyFiltersJob }) } as never,
            scheduledContext: scheduledContext as never,
            params: {},
        });
        expect(triggerApplyFiltersJob).toHaveBeenCalledTimes(1);
        expect(triggerApplyFiltersJob).toHaveBeenCalledWith(scheduledContext);
        expect(result).toEqual({ triggered: true });
    });
});
