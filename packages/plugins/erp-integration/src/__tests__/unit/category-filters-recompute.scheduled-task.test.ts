import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContextService } from '@vendure/core';

import { createCategoryFiltersRecomputeTask } from '../../category-filters-recompute.scheduled-task';
import type { ErpIntegrationPluginOptions } from '../../types';

const recompute = vi.hoisted(() => vi.fn());
vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    recomputeCategoryFilters: recompute,
}));

const injector = {
    get: (token: unknown) =>
        token === RequestContextService ? { create: vi.fn().mockResolvedValue({}) } : {},
};

function run(options: Partial<ErpIntegrationPluginOptions>): Promise<unknown> {
    const task = createCategoryFiltersRecomputeTask(options as ErpIntegrationPluginOptions);
    return task.options.execute({ injector, scheduledContext: {}, params: {} } as never);
}

describe('createCategoryFiltersRecomputeTask', () => {
    beforeEach(() => recompute.mockReset().mockResolvedValue(3));

    it('recomputes on a central hub with Kafka enabled', async () => {
        expect(await run({ instanceType: 'central', kafkaEnabled: true })).toEqual({ updated: 3 });
        expect(recompute).toHaveBeenCalledTimes(1);
    });

    it('does nothing on a branch', async () => {
        expect(await run({ instanceType: 'branch', kafkaEnabled: true })).toEqual({
            skipped: true,
        });
        expect(recompute).not.toHaveBeenCalled();
    });

    it('does nothing when Kafka is disabled (local contour recomputes after the REST import)', async () => {
        expect(await run({ instanceType: 'central', kafkaEnabled: false })).toEqual({
            skipped: true,
        });
        expect(recompute).not.toHaveBeenCalled();
    });
});
