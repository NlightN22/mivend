import { Injectable } from '@nestjs/common';
import { Order, RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { OrderListOptions } from '@vendure/common/lib/generated-types';
import { getRawManyBounded } from 'shared';

import { OrderVisibilityService } from './order-visibility.service';

export const MAX_COUNTERPARTY_IDS = 200;

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
        // Paging and sort would change which orders are summed; one currency assumed (as in getOutstandingBalance).
        const filterOnly: OrderListOptions = {
            filter: options?.filter,
            filterOperator: options?.filterOperator,
        };
        const idsQb = await this.visibility.buildVisibleOrdersQuery(ctx, filterOnly);
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
        if (counterpartyIds.length > MAX_COUNTERPARTY_IDS) {
            throw new UserInputError(`At most ${MAX_COUNTERPARTY_IDS} counterparty ids per call`);
        }
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const rows = await getRawManyBounded<{ counterpartyId: string; lastOrderAt: Date | null }>(
            qb
                .select('counterparty.id::text', 'counterpartyId')
                .addSelect(`MAX(${qb.alias}.orderPlacedAt)`, 'lastOrderAt')
                .andWhere('counterparty.id::text IN (:...lastOrderCounterpartyIds)', {
                    lastOrderCounterpartyIds: counterpartyIds.map(String),
                })
                .orderBy()
                .groupBy('counterparty.id'),
            counterpartyIds.length,
        );
        return rows.flatMap(r =>
            r.lastOrderAt ? [{ counterpartyId: r.counterpartyId, lastOrderAt: r.lastOrderAt }] : [],
        );
    }
}
