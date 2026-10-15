import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ChecksService } from '@mivend/plugin-checks';

import { ORDER_SUBJECT_TYPE } from './order-check-subject';
import { loggerCtx } from './types';

const PAGE_SIZE = 200;
const MAX_PAGES = 20;

// Only orders that already hold fresh stored findings are candidates: the set is small by
// construction, so one indexed query per change is enough. Each flag takes the order lock.
@Injectable()
export class OrderCheckStaleService {
    constructor(
        private connection: TransactionalConnection,
        private checks: ChecksService,
    ) {}

    async markOrder(ctx: RequestContext, orderId: string): Promise<void> {
        await this.checks.markStale(ctx, ORDER_SUBJECT_TYPE, orderId);
    }

    markForProducts(ctx: RequestContext, productErpIds: string[]): Promise<number> {
        if (productErpIds.length === 0) return Promise.resolve(0);
        return this.markPages(
            ctx,
            `JOIN order_line ol ON ol."orderId" = cand.id
             JOIN product_variant pv ON pv.id = ol."productVariantId"
             JOIN product p ON p.id = pv."productId"
             WHERE p."customFieldsExternalid" = ANY($1)`,
            productErpIds,
        );
    }

    // By the contract's own row, so a tombstone (which carries no counterparty) works the same.
    markForContract(ctx: RequestContext, contractErpId: string): Promise<number> {
        return this.markPages(
            ctx,
            `JOIN customer cu ON cu.id = o."customerId"
             JOIN contract c ON c."counterpartyId" = cu."customFieldsCounterpartyid"::text
             WHERE c."erpId" = $1`,
            contractErpId,
        );
    }

    private async markPages(
        ctx: RequestContext,
        joinsAndWhere: string,
        param: unknown,
    ): Promise<number> {
        let marked = 0;
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const rows: Array<{ id: number }> = await this.connection.rawConnection.query(
                `WITH cand AS (
                     SELECT DISTINCT "subjectId"::int AS id FROM check_result
                      WHERE "subjectType" = '${ORDER_SUBJECT_TYPE}' AND stale = false)
                 SELECT DISTINCT cand.id FROM cand
                 JOIN "order" o ON o.id = cand.id AND o.state <> 'Cancelled'
                 ${joinsAndWhere}
                 ORDER BY cand.id LIMIT ${PAGE_SIZE}`,
                [param],
            );
            for (const row of rows) {
                await this.markOrder(ctx, String(row.id));
            }
            marked += rows.length;
            if (rows.length < PAGE_SIZE) return marked;
        }
        Logger.warn(`Order check stale marking stopped at ${marked} orders`, loggerCtx);
        return marked;
    }
}
