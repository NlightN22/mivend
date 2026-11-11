import { Injectable } from '@nestjs/common';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { ID, Order, Payment, RequestContext, TransactionalConnection } from '@vendure/core';

import { CtxLoader } from 'shared';

import { UNCONFIRMED_ERP_STATUSES_SQL } from './open-deferred-exposure.service';

const MAX_SCANNED_ORDERS = 500;
const FLAGGED_PAYMENT_SQL = `p.state IN ('Authorized', 'Settled')
    AND p.metadata::jsonb -> 'public' ->> 'creditLimitExceeded' = 'true'`;

@Injectable()
export class CreditFlagService {
    private flagged = new CtxLoader<boolean>((ctx, keys) => this.loadFlagged(ctx, keys));

    constructor(
        private readonly connection: TransactionalConnection,
        private readonly orderVisibilityService: OrderVisibilityService,
    ) {}

    // Order lists resolve this per row; one request-scoped query answers all of them.
    isOrderFlagged(ctx: RequestContext, orderId: ID): Promise<boolean> {
        return this.flagged.load(ctx, orderId);
    }

    private async loadFlagged(ctx: RequestContext, keys: readonly string[]): Promise<boolean[]> {
        // unbounded-ok: grouped by order id of the batch keys passed in
        const rows = await this.connection
            .getRepository(ctx, Payment)
            .createQueryBuilder('p')
            .select('p."orderId"', 'orderId')
            .distinct(true)
            .where('p."orderId" IN (:...orderIds)', { orderIds: keys.map(Number) })
            .andWhere(FLAGGED_PAYMENT_SQL)
            .getRawMany<{ orderId: number | string }>();
        const flagged = new Set(rows.map(row => String(row.orderId)));
        return keys.map(key => flagged.has(key));
    }

    // Counterparties of in-scope, still-unconfirmed orders that were placed over the limit.
    async flaggedCounterpartyIds(ctx: RequestContext): Promise<string[]> {
        const qb = await this.orderVisibilityService.buildVisibleOrdersQuery(ctx, {
            take: MAX_SCANNED_ORDERS,
        });
        const alias = `"${qb.alias}"`;
        // unbounded-ok: order scan is capped at MAX_SCANNED_ORDERS by the visible orders query
        const orders: Order[] = await qb
            .andWhere(`${alias}.state <> 'Cancelled'`)
            .andWhere(`${alias}."customFieldsErpstatus" IN (${UNCONFIRMED_ERP_STATUSES_SQL})`)
            .andWhere(
                `EXISTS (SELECT 1 FROM payment p WHERE p."orderId" = ${alias}.id AND ${FLAGGED_PAYMENT_SQL})`,
            )
            .getMany();
        const ids = orders
            .map(o => o.customer?.customFields as { counterpartyId?: string } | undefined)
            .map(cf => cf?.counterpartyId)
            .filter((id): id is string => Boolean(id));
        return [...new Set(ids)];
    }
}
