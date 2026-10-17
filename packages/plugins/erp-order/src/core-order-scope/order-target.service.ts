import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    EntityNotFoundError,
    Fulfillment,
    Order,
    OrderLine,
    Payment,
    Refund,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { In, IsNull } from 'typeorm';

import type { OrderTargetKind } from './core-order-operations';

const ENTITY_NAME: Record<OrderTargetKind, string> = {
    order: 'Order',
    orderLine: 'OrderLine',
    payment: 'Payment',
    fulfillment: 'Fulfillment',
    refund: 'Refund',
    orderNote: 'HistoryEntry',
};

// Maps an operation's target ids to the orders they belong to; an unknown id is left to core.
@Injectable()
export class OrderTargetService {
    constructor(private connection: TransactionalConnection) {}

    async orderIds(ctx: RequestContext, kind: OrderTargetKind, ids: ID[]): Promise<ID[]> {
        if (ids.length === 0) return [];
        const rows = await this.query(ctx, kind, ids).getRawMany<{ orderId: ID | null }>();
        return rows.flatMap(row => (row.orderId == null ? [] : [row.orderId]));
    }

    // A fresh draft has no customer yet, so no scope can claim it; its creator must still set one.
    async customerlessDraftIds(ctx: RequestContext, orderIds: ID[]): Promise<Set<string>> {
        if (orderIds.length === 0) return new Set();
        const drafts = await this.connection.getRepository(ctx, Order).find({
            select: { id: true },
            where: { id: In(orderIds), state: 'Draft', customerId: IsNull() },
        });
        return new Set(drafts.map(d => String(d.id)));
    }

    notFound(kind: OrderTargetKind, id: ID): EntityNotFoundError {
        return new EntityNotFoundError(ENTITY_NAME[kind], id);
    }

    private query(ctx: RequestContext, kind: OrderTargetKind, ids: ID[]) {
        const repo = <T extends object>(entity: new () => T) =>
            this.connection.getRepository(ctx, entity).createQueryBuilder('t');
        switch (kind) {
            case 'order':
                return repo(Order).select('t.id', 'orderId').whereInIds(ids);
            case 'orderLine':
                return repo(OrderLine).select('t.orderId', 'orderId').whereInIds(ids);
            case 'payment':
                return repo(Payment)
                    .innerJoin('t.order', 'o')
                    .select('o.id', 'orderId')
                    .whereInIds(ids);
            case 'refund':
                return repo(Refund)
                    .innerJoin('t.payment', 'p')
                    .innerJoin('p.order', 'o')
                    .select('o.id', 'orderId')
                    .whereInIds(ids);
            case 'fulfillment':
                return repo(Fulfillment)
                    .innerJoin('t.lines', 'fl')
                    .innerJoin('fl.orderLine', 'ol')
                    .select('DISTINCT ol.orderId', 'orderId')
                    .whereInIds(ids);
            case 'orderNote':
                // Core does not export the history entry entities; order notes set history_entry.orderId.
                return this.connection
                    .getRepository(ctx, Order)
                    .manager.createQueryBuilder()
                    .select('h."orderId"', 'orderId')
                    .from('history_entry', 'h')
                    .where('h.id IN (:...ids)', { ids });
        }
    }
}
