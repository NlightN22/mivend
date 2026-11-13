import { Injectable } from '@nestjs/common';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { ID, Payment, RequestContext, TransactionalConnection } from '@vendure/core';

import { CtxLoader, getRawManyBounded } from 'shared';

import { UNCONFIRMED_ERP_STATUSES_SQL } from './open-deferred-exposure.service';

const MAX_COUNTERPARTIES = 5000;
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
        const qb = this.connection
            .getRepository(ctx, Payment)
            .createQueryBuilder('p')
            .select('p."orderId"', 'orderId')
            .distinct(true)
            .where('p."orderId" IN (:...orderIds)', { orderIds: keys.map(Number) })
            .andWhere(FLAGGED_PAYMENT_SQL);
        const rows = await getRawManyBounded<{ orderId: number | string }>(
            qb,
            Math.max(1, keys.length),
        );
        const flagged = new Set(rows.map(row => String(row.orderId)));
        return keys.map(key => flagged.has(key));
    }

    // Counterparties of in-scope, still-unconfirmed orders that were placed over the limit.
    async flaggedCounterpartyIds(ctx: RequestContext): Promise<string[]> {
        const qb = await this.orderVisibilityService.buildVisibleOrdersQuery(ctx);
        const alias = `"${qb.alias}"`;
        const rows = await getRawManyBounded<{ counterpartyId: string }>(
            qb
                .select('customer."customFieldsCounterpartyid"', 'counterpartyId')
                .distinct(true)
                .orderBy()
                .andWhere(`${alias}.state <> 'Cancelled'`)
                .andWhere(`${alias}."customFieldsErpstatus" IN (${UNCONFIRMED_ERP_STATUSES_SQL})`)
                .andWhere('customer."customFieldsCounterpartyid" IS NOT NULL')
                .andWhere(
                    `EXISTS (SELECT 1 FROM payment p WHERE p."orderId" = ${alias}.id AND ${FLAGGED_PAYMENT_SQL})`,
                ),
            MAX_COUNTERPARTIES,
        );
        return rows.map(row => row.counterpartyId).filter(id => id !== '');
    }
}
