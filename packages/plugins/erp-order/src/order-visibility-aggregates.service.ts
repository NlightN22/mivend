import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';

import { OrderVisibilityService } from './order-visibility.service';

export interface CounterpartyLastOrder {
    counterpartyId: string;
    lastOrderAt: Date;
}

// Server-side aggregates over the caller's visible orders; the browser must never sum a capped list.
@Injectable()
export class OrderVisibilityAggregatesService {
    constructor(
        private visibility: OrderVisibilityService,
        private connection: TransactionalConnection,
    ) {}

    async sumVisibleTotals(ctx: RequestContext, options?: OrderListOptions): Promise<number> {
        const idsQb = await this.visibility.buildVisibleOrdersQuery(ctx, options);
        idsQb.select(`${idsQb.alias}.id`).orderBy();
        // Summed over an id subquery: the visible query joins order lines, which would repeat rows.
        const row = await this.connection
            .getRepository(ctx, Order)
            .createQueryBuilder('o')
            .select('COALESCE(SUM(o."subTotalWithTax" + o."shippingWithTax"), 0)', 'sum')
            .where(`o.id IN (${idsQb.getQuery()})`, idsQb.getParameters())
            .getRawOne<{ sum: string }>();
        return Number(row?.sum ?? 0);
    }

    async lastOrderDates(
        ctx: RequestContext,
        counterpartyIds: string[],
    ): Promise<CounterpartyLastOrder[]> {
        if (counterpartyIds.length === 0) return [];
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const rows = await qb
            .select('counterparty.id::text', 'counterpartyId')
            .addSelect(`MAX(${qb.alias}.orderPlacedAt)`, 'lastOrderAt')
            .andWhere('counterparty.id::text IN (:...lastOrderCounterpartyIds)', {
                lastOrderCounterpartyIds: counterpartyIds.map(String),
            })
            .orderBy()
            .groupBy('counterparty.id')
            .getRawMany<{ counterpartyId: string; lastOrderAt: Date | null }>();
        return rows.flatMap(r =>
            r.lastOrderAt ? [{ counterpartyId: r.counterpartyId, lastOrderAt: r.lastOrderAt }] : [],
        );
    }
}
