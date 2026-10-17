import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { withAggregateLock } from './aggregate-lock';

// Lock order for a cancel: proforma, then reserve, then the order row (docs/concurrency.md).
export async function withOrderCancelLocks<T>(
    connection: Pick<TransactionalConnection, 'withTransaction' | 'getRepository'>,
    ctx: RequestContext,
    orderId: string | number,
    work: (txCtx: RequestContext) => Promise<T>,
): Promise<T> {
    return withAggregateLock(connection, ctx, `proformaInvoices-for-order:${orderId}`, outer =>
        withAggregateLock(connection, outer, `reserve-order:${orderId}`, work),
    );
}
