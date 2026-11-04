import { ID, RequestContext } from '@vendure/core';

import { CounterpartyBatchLoaders } from './counterparty-batch-loaders.service';

// Nested Counterparty fields reached through an order's customer stay empty for a hidden counterparty (#263).
export function hiddenOnAdmin(
    loaders: CounterpartyBatchLoaders,
    ctx: RequestContext,
    id: ID,
): Promise<boolean> {
    return ctx.apiType === 'admin' ? loaders.isHidden(ctx, id) : Promise.resolve(false);
}
