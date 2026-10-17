import { Injectable } from '@nestjs/common';
import type { ID } from '@vendure/common/lib/shared-types';
import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import type { OrderTargetKind } from './core-order-operations';

// Raw SQL: core does not export every entity (history entries, fulfillment lines) it needs.
const OWNER_SQL: Record<OrderTargetKind, string> = {
    order: `SELECT o.id::text AS "targetId", o.id::text AS "ownerId" FROM "order" o WHERE o.id = ANY($1::int[])`,
    orderLine: `SELECT l.id::text AS "targetId", l."orderId"::text AS "ownerId" FROM order_line l WHERE l.id = ANY($1::int[])`,
    payment: `SELECT p.id::text AS "targetId", p."orderId"::text AS "ownerId" FROM payment p WHERE p.id = ANY($1::int[])`,
    refund: `SELECT r.id::text AS "targetId", p."orderId"::text AS "ownerId" FROM refund r
        LEFT JOIN payment p ON p.id = r."paymentId" WHERE r.id = ANY($1::int[])`,
    fulfillment: `SELECT fl."fulfillmentId"::text AS "targetId", l."orderId"::text AS "ownerId"
        FROM order_line_reference fl LEFT JOIN order_line l ON l.id = fl."orderLineId"
        WHERE fl.discriminator = 'FulfillmentLine' AND fl."fulfillmentId" = ANY($1::int[])`,
    orderNote: `SELECT h.id::text AS "targetId", h."orderId"::text AS "ownerId" FROM history_entry h
        WHERE h.discriminator = 'OrderHistoryEntry' AND h.id = ANY($1::int[])`,
    customer: `SELECT c.id::text AS "targetId", c."customFieldsCounterpartyid"::text AS "ownerId"
        FROM customer c WHERE c.id = ANY($1::int[])`,
    customerEmail: `SELECT lower(c."emailAddress") AS "targetId", c."customFieldsCounterpartyid"::text AS "ownerId"
        FROM customer c WHERE c."deletedAt" IS NULL AND lower(c."emailAddress") = ANY($1::text[])`,
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
        const keys =
            kind === 'customerEmail'
                ? ids.map(id => String(id).trim().toLowerCase())
                : ids.map(String).filter(id => /^\d{1,9}$/.test(id));
        if (keys.length === 0) return new Map();
        const rows = await this.query<{ targetId: string; ownerId: string | null }>(
            ctx,
            OWNER_SQL[kind],
            keys,
        );
        const owners = new Map<string, Array<string | null>>();
        for (const row of rows) {
            owners.set(row.targetId, [...(owners.get(row.targetId) ?? []), row.ownerId]);
        }
        return owners;
    }

    async customerlessDraftIds(ctx: RequestContext, orderIds: string[]): Promise<Set<string>> {
        const ids = orderIds.filter(id => /^\d{1,9}$/.test(id));
        if (ids.length === 0) return new Set();
        const rows = await this.query<{ id: string }>(
            ctx,
            `SELECT o.id::text AS id FROM "order" o
             WHERE o.state = 'Draft' AND o."customerId" IS NULL AND o.id = ANY($1::int[])`,
            orderIds,
        );
        return new Set(rows.map(row => row.id));
    }

    // Integer ids keep the primary-key index; a non-numeric id has no owner and is left to core.
    private query<T>(ctx: RequestContext, sql: string, keys: string[]): Promise<T[]> {
        return this.connection.getRepository(ctx, Order).manager.query(sql, [keys]);
    }
}
