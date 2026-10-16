import { Injectable, OnModuleInit } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    CheckStaleRequestService,
    CheckStaleRequestWriter,
    ChecksService,
} from '@mivend/plugin-checks';

import { ORDER_SUBJECT_TYPE } from './order-check-subject';

const PAGE_SIZE = 200;
const PRODUCT_KIND = 'order-product';
const CONTRACT_KIND = 'order-contract';

// Only orders that already hold fresh stored findings are candidates (partial index on them).
// Keyset pages by order id, no cap; each flag takes the order lock, ascending so callers cannot deadlock.
@Injectable()
export class OrderCheckStaleService implements OnModuleInit {
    constructor(
        private connection: TransactionalConnection,
        private checks: ChecksService,
        private writer: CheckStaleRequestWriter,
        private requests: CheckStaleRequestService,
    ) {}

    onModuleInit(): void {
        this.requests.registerHandler(PRODUCT_KIND, async (ctx, key) => {
            await this.markForProducts(ctx, [key]);
        });
        this.requests.registerHandler(CONTRACT_KIND, async (ctx, key) => {
            await this.markForContract(ctx, key);
        });
    }

    // Written in the data change's own transaction; the marking itself runs later, in short transactions.
    async requestForProducts(ctx: RequestContext, productErpIds: string[]): Promise<void> {
        for (const id of new Set(productErpIds)) await this.writer.request(ctx, PRODUCT_KIND, id);
    }

    requestForContract(ctx: RequestContext, contractErpId: string): Promise<void> {
        return this.writer.request(ctx, CONTRACT_KIND, contractErpId);
    }

    drainSoon(): void {
        this.requests.drainSoon();
    }

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
        let lastId = 0;
        for (;;) {
            const rows: Array<{ id: number }> = await this.connection.rawConnection.query(
                `WITH cand AS (
                     SELECT DISTINCT "subjectId"::int AS id FROM check_result
                      WHERE "subjectType" = '${ORDER_SUBJECT_TYPE}' AND stale = false)
                 SELECT DISTINCT cand.id FROM cand
                 JOIN "order" o ON o.id = cand.id AND o.state <> 'Cancelled'
                 ${joinsAndWhere}
                   AND cand.id > $2
                 ORDER BY cand.id LIMIT ${PAGE_SIZE}`,
                [param, lastId],
            );
            for (const row of rows) {
                await this.markOrder(ctx, String(row.id));
            }
            marked += rows.length;
            if (rows.length < PAGE_SIZE) return marked;
            lastId = rows[rows.length - 1].id;
        }
    }
}
