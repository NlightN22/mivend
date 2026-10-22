import { ID, RequestContext } from '@vendure/core';

import { CounterpartyService } from './counterparty.service';

const memo = new WeakMap<RequestContext, Map<string, Promise<boolean>>>();

// Nested Counterparty fields reached through an order's customer stay empty for a hidden counterparty (#263).
export function hiddenOnAdmin(
    service: CounterpartyService,
    ctx: RequestContext,
    id: ID,
): Promise<boolean> {
    if (ctx.apiType !== 'admin') return Promise.resolve(false);
    let seen = memo.get(ctx);
    if (!seen) memo.set(ctx, (seen = new Map()));
    const key = String(id);
    let hidden = seen.get(key);
    if (!hidden) {
        hidden = service.findOneVisible(ctx, id).then(c => !c);
        seen.set(key, hidden);
    }
    return hidden;
}
