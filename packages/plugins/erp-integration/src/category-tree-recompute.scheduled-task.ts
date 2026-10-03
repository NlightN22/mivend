import {
    CollectionService,
    FacetService,
    FacetValueService,
    RequestContextService,
    ScheduledTask,
    TransactionalConnection,
} from '@vendure/core';
import { cronEveryMs, recomputeCategoryTree } from 'shared';

import { CATEGORY_TREE_RECOMPUTE_INTERVAL_DEFAULT, KAFKA_ENABLED_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Per-event writes cover the category itself only; subtree filters and hidden state flowing
// down to descendants reach the rest of the tree through this low-frequency sweep.
export function createCategoryTreeRecomputeTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs =
        options.categoryTreeRecomputeIntervalMs ?? CATEGORY_TREE_RECOMPUTE_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-category-tree-recompute',
        description:
            'Recomputes category Collection subtree filters and propagated hidden state (central hub only); writes only changed Collections.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const updated = await recomputeCategoryTree(ctx, {
                connection: injector.get(TransactionalConnection),
                collectionService: injector.get(CollectionService),
                facetService: injector.get(FacetService),
                facetValueService: injector.get(FacetValueService),
            });
            return { updated };
        },
    });
}
