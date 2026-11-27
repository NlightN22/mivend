import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { isNewerVersion, withAggregateLock } from 'shared';

export type OrderEventStream = 'order-changed' | 'order-state';

const COLUMN: Record<OrderEventStream, string> = {
    'order-changed': 'customFieldsErpchangedversion',
    'order-state': 'customFieldsErpstateversion',
};

export type OrderEventGuardResult<T> = { stale: true } | { stale: false; value: T };

// Per-stream source version of the newest event applied to an order (#414). A delivery older than it is
// ignored, so the inbox row of the newest version is no longer needed as the version reference.
@Injectable()
export class OrderEventVersionService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Runs `work` unless the order already holds a newer version of this stream; records the version after it.
    async apply<T>(
        ctx: RequestContext,
        erpOrderId: string,
        stream: OrderEventStream,
        version: string,
        work: (txCtx: RequestContext) => Promise<T>,
    ): Promise<OrderEventGuardResult<T>> {
        return withAggregateLock(
            this.connection,
            ctx,
            `order-event-version:${erpOrderId}`,
            async txCtx => {
                const column = COLUMN[stream];
                const repo = this.connection.getRepository(txCtx, Order);
                const [row] = await repo.query(
                    `SELECT "${column}" AS stored FROM "order" WHERE "customFieldsErporderid" = $1 LIMIT 1`,
                    [erpOrderId],
                );
                const stored: string | null = row?.stored ?? null;
                if (stored !== null && isNewerVersion(stored, version)) return { stale: true };
                const value = await work(txCtx);
                if (stored === null || isNewerVersion(version, stored)) {
                    await repo.query(
                        `UPDATE "order" SET "${column}" = $2 WHERE "customFieldsErporderid" = $1`,
                        [erpOrderId, version],
                    );
                }
                return { stale: false, value };
            },
        );
    }
}
