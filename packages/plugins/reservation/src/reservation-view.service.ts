import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

import { distributeErpReserve } from './erp-reserve-distribution';
import { batchedLineFlag } from './reservation-line-flags';
import type { LineReservationFlag, RawQuery, Row } from './reservation-line-flags';
import { ctxQuery } from 'shared';

export type { LineReservationFlag } from './reservation-line-flags';

export type ReservationSource = 'LOCAL' | 'ERP';

export interface OrderReservationDetail {
    orderLineId: string;
    productVariantId: string;
    sku: string;
    source: ReservationSource;
    quantity: number;
    until: Date | null;
    status: string;
}

export interface VariantReservationHolder {
    orderId: string;
    orderCode: string;
    counterpartyName: string | null;
    managerName: string | null;
    source: ReservationSource;
    quantity: number;
    until: Date | null;
}

const HOLDERS_LIMIT = 200;
const HOLDERS_MAX_PAGES = 25;

@Injectable()
export class ReservationViewService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
    ) {}

    async details(ctx: RequestContext, orderId: ID): Promise<OrderReservationDetail[]> {
        if (!(await this.visibleIds(ctx, [String(orderId)])).has(String(orderId))) return [];
        const query = this.rawQuery(ctx);
        const id = String(orderId);
        const local = await query(
            `SELECT r."orderLineId", r."productVariantId", v.sku, r.quantity, r."expiresAt" AS until, r.status
               FROM reservation r JOIN product_variant v ON v.id = r."productVariantId"::int
              WHERE r."orderId" = $1 ORDER BY r."reservedAt" DESC`,
            [id],
        );
        const erp = await query(
            `SELECT e."productVariantId", v.sku, e.quantity, e."reserveUntil" AS until
               FROM erp_order_reserve e JOIN product_variant v ON v.id = e."productVariantId"::int
              WHERE e."orderId" = $1 AND e.quantity > 0`,
            [id],
        );
        const lines = erp.length
            ? await query(
                  `SELECT id::text AS id, "productVariantId"::text AS "variantId", quantity
                     FROM order_line WHERE "orderId" = $1::int`,
                  [id],
              )
            : [];
        return [...local.map(r => toDetail(r, 'LOCAL')), ...erp.flatMap(r => erpDetails(r, lines))];
    }

    lineFlag(ctx: RequestContext, lineId: ID): Promise<LineReservationFlag> {
        return batchedLineFlag(ctx, this.rawQuery(ctx), String(lineId));
    }

    private rawQuery(ctx: RequestContext): RawQuery {
        return (sql, params) => ctxQuery<Row[]>(this.connection, ctx, sql, params);
    }

    // Visibility is applied per page of rows, so foreign reservations never crowd out visible ones.
    async holders(ctx: RequestContext, variantId: ID): Promise<VariantReservationHolder[]> {
        const result: VariantReservationHolder[] = [];
        let page = 0;
        for (let offset = 0; result.length < HOLDERS_LIMIT; offset += HOLDERS_LIMIT, page += 1) {
            if (page >= HOLDERS_MAX_PAGES) break;
            const rows = await this.holderPage(ctx, String(variantId), offset);
            const visible = await this.visibleIds(
                ctx,
                rows.map(r => String(r.orderId)),
            );
            result.push(...rows.filter(r => visible.has(String(r.orderId))).map(toHolder));
            if (rows.length < HOLDERS_LIMIT) break;
        }
        return result.slice(0, HOLDERS_LIMIT);
    }

    private holderPage(ctx: RequestContext, variantId: string, offset: number): Promise<Row[]> {
        return this.rawQuery(ctx)(
            `SELECT * FROM (
               SELECT o.id::text AS "orderId", o.code AS "orderCode", 'LOCAL' AS source, r.id::text AS rid,
                      r.quantity, r."expiresAt" AS until, c."shortName" AS "counterpartyName",
                      trim(concat(a."firstName", ' ', a."lastName")) AS "managerName"
                 FROM reservation r JOIN "order" o ON o.id = r."orderId"::int
                 LEFT JOIN customer cu ON cu.id = o."customerId"
                 LEFT JOIN counterparty c ON c.id::text = cu."customFieldsCounterpartyid"
                 LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
                WHERE r."productVariantId" = $1 AND r.status = 'active'
               UNION ALL
               SELECT o.id::text, o.code, 'ERP', e.id::text, e.quantity, e."reserveUntil", c."shortName",
                      trim(concat(a."firstName", ' ', a."lastName"))
                 FROM erp_order_reserve e JOIN "order" o ON o.id = e."orderId"::int
                 LEFT JOIN customer cu ON cu.id = o."customerId"
                 LEFT JOIN counterparty c ON c.id::text = cu."customFieldsCounterpartyid"
                 LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
                WHERE e."productVariantId" = $1 AND e.quantity > 0 AND o.state <> 'Cancelled'
             ) h ORDER BY until ASC NULLS LAST, "orderId", source, rid LIMIT ${HOLDERS_LIMIT} OFFSET $2`,
            [variantId, offset],
        );
    }

    private async visibleIds(ctx: RequestContext, ids: string[]): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        const qb = await this.visibility.buildVisibleOrdersQuery(ctx);
        const rows = await qb
            .andWhere(`${qb.alias}.id IN (:...ids)`, { ids })
            .select(`${qb.alias}.id`)
            .getMany();
        return new Set(rows.map(o => String(o.id)));
    }
}

function toHolder(r: Row): VariantReservationHolder {
    return {
        orderId: String(r.orderId),
        orderCode: String(r.orderCode),
        counterpartyName: (r.counterpartyName as string | null) ?? null,
        managerName: (r.managerName as string) || null,
        source: r.source as ReservationSource,
        quantity: Number(r.quantity),
        until: (r.until as Date | null) ?? null,
    };
}

// One ERP quantity per order and variant is spread over that variant's lines (erp-reserve-distribution.ts).
function erpDetails(r: Row, lines: Row[]): OrderReservationDetail[] {
    const siblings = lines
        .filter(l => String(l.variantId) === String(r.productVariantId))
        .map(l => ({ id: String(l.id), quantity: Number(l.quantity) }));
    return [...distributeErpReserve(siblings, Number(r.quantity))].map(([lineId, share]) =>
        toDetail({ ...r, orderLineId: lineId, quantity: share }, 'ERP', 'held by ERP'),
    );
}

function toDetail(
    r: Record<string, unknown>,
    source: ReservationSource,
    status?: string,
): OrderReservationDetail {
    return {
        orderLineId: String(r.orderLineId),
        productVariantId: String(r.productVariantId),
        sku: String(r.sku),
        source,
        quantity: Number(r.quantity),
        until: (r.until as Date | null) ?? null,
        status: status ?? String(r.status),
    };
}
