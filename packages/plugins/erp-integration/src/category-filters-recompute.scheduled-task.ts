import {
    CollectionService,
    FacetService,
    FacetValueService,
    RequestContextService,
    ScheduledTask,
    TransactionalConnection,
} from '@vendure/core';
import { cronEveryMs, recomputeCategoryFilters } from 'shared';

import { CATEGORY_FILTERS_RECOMPUTE_INTERVAL_DEFAULT, KAFKA_ENABLED_DEFAULT } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Category filters are per-event for the category itself only; subtree changes (a descendant
// added, moved or finally named) reach ancestors through this low-frequency sweep.
export function createCategoryFiltersRecomputeTask(
    options: ErpIntegrationPluginOptions,
): ScheduledTask {
    const everyMs =
        options.categoryFiltersRecomputeIntervalMs ?? CATEGORY_FILTERS_RECOMPUTE_INTERVAL_DEFAULT;
    return new ScheduledTask({
        id: 'erp-integration-category-filters-recompute',
        description:
            'Recomputes each category Collection filter as "any FacetValue in its subtree" (central hub only); writes only changed Collections.',
        schedule: cronEveryMs(everyMs),
        execute: async ({ injector }) => {
            if (options.instanceType !== 'central') return { skipped: true };
            if (!(options.kafkaEnabled ?? KAFKA_ENABLED_DEFAULT)) return { skipped: true };

            const ctx = await injector.get(RequestContextService).create({ apiType: 'admin' });
            const updated = await recomputeCategoryFilters(ctx, {
                connection: injector.get(TransactionalConnection),
                collectionService: injector.get(CollectionService),
                facetService: injector.get(FacetService),
                facetValueService: injector.get(FacetValueService),
            });
            return { updated };
        },
    });
}
