import { distributeErpReserve } from './erp-reserve-distribution';

export interface LineReservationFlag {
    reserved: boolean;
    reservedUntil: Date | null;
}

export type Row = Record<string, unknown>;
export type RawQuery = (sql: string, params: unknown[]) => Promise<Row[]>;

const NOT_RESERVED: LineReservationFlag = { reserved: false, reservedUntil: null };

// Three queries for any number of lines: sibling lines, local holds, ERP holds.
export async function loadLineFlags(
    query: RawQuery,
    lineIds: string[],
): Promise<Map<string, LineReservationFlag>> {
    const lines = await query(
        `SELECT l.id::text AS id, l."orderId"::text AS "orderId", l."productVariantId"::text AS "variantId",
                l.quantity, o.state
           FROM order_line l JOIN "order" o ON o.id = l."orderId"
          WHERE l."orderId" IN (SELECT "orderId" FROM order_line WHERE id = ANY($1::int[]))`,
        [lineIds],
    );
    const local = await query(
        `SELECT "orderLineId" AS id, min("expiresAt") AS until FROM reservation
          WHERE "orderLineId" = ANY($1::text[]) AND status = 'active' GROUP BY "orderLineId"`,
        [lineIds],
    );
    const orderIds = [...new Set(lines.map(l => String(l.orderId)))];
    const erp = orderIds.length
        ? await query(
              `SELECT "orderId", "productVariantId", "reserveUntil" AS until, quantity
                 FROM erp_order_reserve WHERE "orderId" = ANY($1::text[]) AND quantity > 0`,
              [orderIds],
          )
        : [];

    const localByLine = new Map(local.map(r => [String(r.id), r.until as Date | null] as const));
    const erpShares = new Map<string, { until: Date | null; share: number }>();
    for (const r of erp) {
        const siblings = lines.filter(
            l =>
                String(l.orderId) === String(r.orderId) &&
                String(l.variantId) === String(r.productVariantId),
        );
        for (const [lineId, share] of distributeErpReserve(
            siblings.map(l => ({ id: String(l.id), quantity: Number(l.quantity) })),
            Number(r.quantity),
        )) {
            erpShares.set(lineId, { until: r.until as Date | null, share });
        }
    }

    const flags = new Map<string, LineReservationFlag>();
    for (const id of lineIds) {
        const line = lines.find(l => String(l.id) === id);
        if (!line || line.state === 'Cancelled') {
            flags.set(id, NOT_RESERVED);
            continue;
        }
        const heldLocally = localByLine.has(id);
        const erpHold = erpShares.get(id);
        const dates = [heldLocally ? localByLine.get(id) : null, erpHold?.until]
            .filter((d): d is Date => d != null)
            .map(d => d.getTime());
        flags.set(id, {
            reserved: heldLocally || erpHold != null,
            reservedUntil: dates.length > 0 ? new Date(Math.min(...dates)) : null,
        });
    }
    return flags;
}

interface Batch {
    ids: Set<string>;
    result: Promise<Map<string, LineReservationFlag>>;
}

interface RequestFlags {
    memo: Map<string, Promise<LineReservationFlag>>;
    open: Batch | null;
}

const perRequest = new WeakMap<object, RequestFlags>();

// DataLoader-style: every line asked for in the same tick shares one loadLineFlags() call.
export function batchedLineFlag(
    key: object,
    query: RawQuery,
    lineId: string,
): Promise<LineReservationFlag> {
    const state = perRequest.get(key) ?? { memo: new Map(), open: null };
    perRequest.set(key, state);
    const cached = state.memo.get(lineId);
    if (cached) return cached;
    if (!state.open) {
        const batch: Batch = {
            ids: new Set(),
            result: Promise.resolve().then(() => {
                state.open = null;
                return loadLineFlags(query, [...batch.ids]);
            }),
        };
        state.open = batch;
    }
    const batch = state.open;
    batch.ids.add(lineId);
    const flag = batch.result.then(m => m.get(lineId) ?? NOT_RESERVED);
    state.memo.set(lineId, flag);
    return flag;
}
