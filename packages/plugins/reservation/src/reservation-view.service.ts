import { Injectable } from '@nestjs/common';
import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { OrderVisibilityService } from '@mivend/plugin-erp-order';

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

export interface LineReservationFlag {
    reserved: boolean;
    reservedUntil: Date | null;
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

// reserved and reservedUntil of one line are resolved separately; compute the flag once per request.
const flagMemo = new WeakMap<RequestContext, Map<string, Promise<LineReservationFlag>>>();

@Injectable()
export class ReservationViewService {
    constructor(
        private connection: TransactionalConnection,
        private visibility: OrderVisibilityService,
    ) {}

    async details(ctx: RequestContext, orderId: ID): Promise<OrderReservationDetail[]> {
        if (!(await this.visibleIds(ctx, [String(orderId)])).has(String(orderId))) return [];
        const query = this.connection.rawConnection.query.bind(this.connection.rawConnection);
        const local = await query(
            `SELECT r."orderLineId", r."productVariantId", v.sku, r.quantity, r."expiresAt" AS until, r.status
               FROM reservation r JOIN product_variant v ON v.id::text = r."productVariantId"
              WHERE r."orderId" = $1 ORDER BY r."reservedAt" DESC`,
            [String(orderId)],
        );
        const erp = await query(
            `SELECT (SELECT l.id FROM order_line l WHERE l."orderId"::text = $1::text AND l."productVariantId"::text = e."productVariantId"
                      ORDER BY l.id LIMIT 1) AS "orderLineId",
                    e."productVariantId", v.sku, e.quantity, e."reserveUntil" AS until
               FROM erp_order_reserve e JOIN product_variant v ON v.id::text = e."productVariantId"
              WHERE e."orderId" = $1::text AND e.quantity > 0`,
            [String(orderId)],
        );
        return [
            ...local.map((r: Record<string, unknown>) => toDetail(r, 'LOCAL')),
            ...erp
                .filter((r: Record<string, unknown>) => r.orderLineId != null)
                .map((r: Record<string, unknown>) => toDetail(r, 'ERP', 'held by ERP')),
        ];
    }

    lineFlag(ctx: RequestContext, lineId: ID): Promise<LineReservationFlag> {
        const memo = flagMemo.get(ctx) ?? new Map<string, Promise<LineReservationFlag>>();
        flagMemo.set(ctx, memo);
        const key = String(lineId);
        const cached = memo.get(key);
        if (cached) return cached;
        const computed = this.computeLineFlag(key);
        memo.set(key, computed);
        return computed;
    }

    private async computeLineFlag(lineId: string): Promise<LineReservationFlag> {
        const query = this.connection.rawConnection.query.bind(this.connection.rawConnection);
        const [line] = await query(
            `SELECT l."orderId", l."productVariantId", o.state FROM order_line l
               JOIN "order" o ON o.id = l."orderId" WHERE l.id = $1`,
            [lineId],
        );
        if (!line || line.state === 'Cancelled') return { reserved: false, reservedUntil: null };
        const [local] = await query(
            `SELECT min("expiresAt") AS until, count(*)::int AS n FROM reservation
              WHERE "orderLineId" = $1 AND status = 'active'`,
            [lineId],
        );
        const [erp] = await query(
            `SELECT "reserveUntil" AS until, quantity FROM erp_order_reserve
              WHERE "orderId" = $1 AND "productVariantId" = $2`,
            [String(line.orderId), String(line.productVariantId)],
        );
        const erpHeld = erp != null && erp.quantity > 0;
        const dates = [local.n > 0 ? local.until : null, erpHeld ? erp.until : null]
            .filter((d): d is Date => d != null)
            .map(d => d.getTime());
        return {
            reserved: local.n > 0 || erpHeld,
            reservedUntil: dates.length > 0 ? new Date(Math.min(...dates)) : null,
        };
    }

    async holders(ctx: RequestContext, variantId: ID): Promise<VariantReservationHolder[]> {
        const rows: Array<Record<string, unknown>> = await this.connection.rawConnection.query(
            `SELECT * FROM (
               SELECT o.id::text AS "orderId", o.code AS "orderCode", 'LOCAL' AS source,
                      r.quantity, r."expiresAt" AS until, c."shortName" AS "counterpartyName",
                      trim(concat(a."firstName", ' ', a."lastName")) AS "managerName"
                 FROM reservation r JOIN "order" o ON o.id::text = r."orderId"
                 LEFT JOIN customer cu ON cu.id = o."customerId"
                 LEFT JOIN counterparty c ON cu."customFieldsCounterpartyid"::text = c.id::text
                 LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
                WHERE r."productVariantId" = $1 AND r.status = 'active'
               UNION ALL
               SELECT o.id::text, o.code, 'ERP', e.quantity, e."reserveUntil", c."shortName",
                      trim(concat(a."firstName", ' ', a."lastName"))
                 FROM erp_order_reserve e JOIN "order" o ON o.id::text = e."orderId"
                 LEFT JOIN customer cu ON cu.id = o."customerId"
                 LEFT JOIN counterparty c ON cu."customFieldsCounterpartyid"::text = c.id::text
                 LEFT JOIN administrator a ON a.id::text = c."assignedManagerId"
                WHERE e."productVariantId" = $1 AND e.quantity > 0 AND o.state <> 'Cancelled'
             ) h ORDER BY until ASC NULLS LAST LIMIT ${HOLDERS_LIMIT}`,
            [String(variantId)],
        );
        const visible = await this.visibleIds(
            ctx,
            rows.map(r => String(r.orderId)),
        );
        return rows
            .filter(r => visible.has(String(r.orderId)))
            .map(r => ({
                orderId: String(r.orderId),
                orderCode: String(r.orderCode),
                counterpartyName: (r.counterpartyName as string | null) ?? null,
                managerName: (r.managerName as string) || null,
                source: r.source as ReservationSource,
                quantity: Number(r.quantity),
                until: (r.until as Date | null) ?? null,
            }));
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
