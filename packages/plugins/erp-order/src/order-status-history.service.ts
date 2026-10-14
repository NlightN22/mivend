import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { withAggregateLock } from 'shared';

import { OrderStatusHistoryEntry } from './entities/order-status-history-entry.entity';

// Single write point of the status history; the previous status is read under the per-order
// lock, so a replayed or concurrent report of the same status adds no row.
@Injectable()
export class OrderStatusHistoryService {
    constructor(private connection: TransactionalConnection) {}

    async record(ctx: RequestContext, orderId: number | string, status: string): Promise<void> {
        const id = Number(orderId);
        await withAggregateLock(this.connection, ctx, `order-status-history:${id}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, OrderStatusHistoryEntry);
            const last = await repo.findOne({ where: { orderId: id }, order: { id: 'DESC' } });
            if (last?.status === status) return;
            await repo.insert({
                uuid: randomUUID(),
                orderId: id,
                previousStatus: last?.status ?? null,
                status,
            });
        });
    }

    list(ctx: RequestContext, orderId: number | string): Promise<OrderStatusHistoryEntry[]> {
        return this.connection
            .getRepository(ctx, OrderStatusHistoryEntry)
            .find({ where: { orderId: Number(orderId) }, order: { id: 'ASC' } });
    }
}
