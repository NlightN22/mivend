import { Injectable } from '@nestjs/common';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';
import { ID, Order, Payment, RequestContext, TransactionalConnection } from '@vendure/core';

import { DEFERRED_PAYMENT_METHOD_CODE } from './deferred-payment-handler';
import { UNCONFIRMED_ERP_STATUSES } from './open-deferred-exposure.service';

const MAX_SCANNED_ORDERS = 500;
const FLAGGED_PAYMENT_SQL = `p.method = :method
    AND p.state IN ('Authorized', 'Settled')
    AND p.metadata::jsonb -> 'public' ->> 'creditLimitExceeded' = 'true'`;

@Injectable()
export class CreditFlagService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly orderVisibilityService: OrderVisibilityService,
    ) {}

    async isOrderFlagged(ctx: RequestContext, orderId: ID): Promise<boolean> {
        const count = await this.connection
            .getRepository(ctx, Payment)
            .createQueryBuilder('p')
            .where('p."orderId" = :orderId', { orderId })
            .andWhere(FLAGGED_PAYMENT_SQL, { method: DEFERRED_PAYMENT_METHOD_CODE })
            .getCount();
        return count > 0;
    }

    // Counterparties of in-scope, still-unconfirmed orders that were placed over the limit.
    async flaggedCounterpartyIds(ctx: RequestContext): Promise<string[]> {
        const qb = await this.orderVisibilityService.buildVisibleOrdersQuery(ctx, {
            take: MAX_SCANNED_ORDERS,
        });
        const alias = `"${qb.alias}"`;
        const orders: Order[] = await qb
            .andWhere(`${alias}.state <> 'Cancelled'`)
            .andWhere(`${alias}."customFieldsErpstatus" IN (:...erpStatuses)`, {
                erpStatuses: UNCONFIRMED_ERP_STATUSES,
            })
            .andWhere(
                `EXISTS (SELECT 1 FROM payment p WHERE p."orderId" = ${alias}.id AND ${FLAGGED_PAYMENT_SQL})`,
                { method: DEFERRED_PAYMENT_METHOD_CODE },
            )
            .getMany();
        const ids = orders
            .map(o => o.customer?.customFields as { counterpartyId?: string } | undefined)
            .map(cf => cf?.counterpartyId)
            .filter((id): id is string => Boolean(id));
        return [...new Set(ids)];
    }
}
