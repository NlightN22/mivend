import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import type { OrderTargetKind } from './core-order-operations';

// Raw SQL: core does not export every entity (history entries, fulfillment lines) it needs.
const OWNER_SQL: Record<OrderTargetKind, string> = {
    order: `SELECT o.id::text AS "targetId", o.id::text AS "ownerId" FROM "order" o WHERE o.id::text = ANY($1)`,
    orderLine: `SELECT l.id::text AS "targetId", l."orderId"::text AS "ownerId" FROM order_line l WHERE l.id::text = ANY($1)`,
    payment: `SELECT p.id::text AS "targetId", p."orderId"::text AS "ownerId" FROM payment p WHERE p.id::text = ANY($1)`,
    refund: `SELECT r.id::text AS "targetId", p."orderId"::text AS "ownerId" FROM refund r
        LEFT JOIN payment p ON p.id = r."paymentId" WHERE r.id::text = ANY($1)`,
    fulfillment: `SELECT fl."fulfillmentId"::text AS "targetId", l."orderId"::text AS "ownerId"
        FROM order_line_reference fl LEFT JOIN order_line l ON l.id = fl."orderLineId"
        WHERE fl.discriminator = 'FulfillmentLine' AND fl."fulfillmentId"::text = ANY($1)`,
    orderNote: `SELECT h.id::text AS "targetId", h."orderId"::text AS "ownerId" FROM history_entry h
        WHERE h.discriminator = 'OrderHistoryEntry' AND h.id::text = ANY($1)`,
    customer: `SELECT c.id::text AS "targetId", c."customFieldsCounterpartyid"::text AS "ownerId"
        FROM customer c WHERE c.id::text = ANY($1)`,
};

// Maps target ids to their owners (orders, or a customer's counterparty). An id absent from the
// map does not exist and is left to core; a present id with a null owner is a dangling row.
@Injectable()
export class OrderTargetService {
    constructor(private connection: TransactionalConnection) {}

    async owners(
        ctx: RequestContext,
        kind: OrderTargetKind,
        ids: ID[],
    ): Promise<Map<string, Array<string | null>>> {
        if (ids.length === 0) return new Map();
        const rows = await this.query<{ targetId: string; ownerId: string | null }>(
            ctx,
            OWNER_SQL[kind],
            ids,
        );
        const owners = new Map<string, Array<string | null>>();
        for (const row of rows) {
            owners.set(row.targetId, [...(owners.get(row.targetId) ?? []), row.ownerId]);
        }
        return owners;
    }

    async customerlessDraftIds(ctx: RequestContext, orderIds: string[]): Promise<Set<string>> {
        if (orderIds.length === 0) return new Set();
        const rows = await this.query<{ id: string }>(
            ctx,
            `SELECT o.id::text AS id FROM "order" o
             WHERE o.state = 'Draft' AND o."customerId" IS NULL AND o.id::text = ANY($1)`,
            orderIds,
        );
        return new Set(rows.map(row => row.id));
    }

    private query<T>(ctx: RequestContext, sql: string, ids: ID[]): Promise<T[]> {
        return this.connection.getRepository(ctx, Order).manager.query(sql, [ids.map(String)]);
    }
}
