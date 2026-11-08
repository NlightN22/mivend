import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CtxLoader, ctxQuery } from 'shared';

export const MAX_CARD_REFUNDS = 50;

export interface CardRefund {
    id: string;
    number: string;
    amount: number;
    status: string;
    reason: string;
    createdAt: Date;
}

export interface CardProforma {
    id: string;
    number: string;
    version: number;
    amount: number;
    currencyCode: string;
    status: string;
    dueDate: Date;
}

export interface CardOrder {
    code: string;
    state: string;
    orderTotal: number;
    currencyCode: string;
}

// Batches the per-payment lookups of the manager payment card; the root query already applied scope.
@Injectable()
export class PaymentCardLoader {
    constructor(private connection: TransactionalConnection) {}

    private refunds = new CtxLoader<CardRefund[]>((ctx, keys) => this.loadRefunds(ctx, keys));
    private proformas = new CtxLoader<CardProforma | null>((ctx, keys) =>
        this.loadProformas(ctx, keys),
    );
    private orders = new CtxLoader<CardOrder | null>((ctx, keys) => this.loadOrders(ctx, keys));

    refundsOf(ctx: RequestContext, paymentId: string): Promise<CardRefund[]> {
        return this.refunds.load(ctx, paymentId);
    }

    proforma(ctx: RequestContext, proformaInvoiceId: string): Promise<CardProforma | null> {
        return this.proformas.load(ctx, proformaInvoiceId);
    }

    order(ctx: RequestContext, orderId: string): Promise<CardOrder | null> {
        return this.orders.load(ctx, orderId);
    }

    private async loadRefunds(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<CardRefund[][]> {
        const rows = await ctxQuery<
            Array<Omit<CardRefund, 'id'> & { id: number; paymentId: number }>
        >(
            this.connection,
            ctx,
            `SELECT id, "paymentId", number, amount, status, reason, "createdAt" FROM (
                 SELECT r.*, ROW_NUMBER() OVER (
                     PARTITION BY r."paymentId" ORDER BY r."createdAt" DESC, r.id DESC) AS rn
                 FROM payment_refund r WHERE r."paymentId" = ANY($1::int[])
             ) ranked WHERE rn <= $2 ORDER BY "createdAt" DESC, id DESC`,
            [keys.map(Number), MAX_CARD_REFUNDS],
        );
        const grouped = new Map<string, CardRefund[]>();
        for (const { paymentId, ...refund } of rows) {
            const list = grouped.get(String(paymentId)) ?? [];
            list.push({ ...refund, id: String(refund.id) });
            grouped.set(String(paymentId), list);
        }
        return keys.map(key => grouped.get(key) ?? []);
    }

    private async loadProformas(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<CardProforma | null>> {
        const rows = await ctxQuery<Array<Omit<CardProforma, 'id'> & { id: number }>>(
            this.connection,
            ctx,
            `SELECT id, number, version, amount, "currencyCode", status, "dueDate"
             FROM proforma_invoice WHERE id = ANY($1::int[])`,
            [keys.map(Number)],
        );
        const byId = new Map(rows.map(row => [String(row.id), { ...row, id: String(row.id) }]));
        return keys.map(key => byId.get(key) ?? null);
    }

    // Same channel rule as OrderService.findOne.
    private async loadOrders(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<CardOrder | null>> {
        const rows = await ctxQuery<Array<CardOrder & { id: number }>>(
            this.connection,
            ctx,
            `SELECT o.id, o.code, o.state, o."currencyCode",
                    o."subTotalWithTax" + o."shippingWithTax" AS "orderTotal"
             FROM "order" o
             JOIN order_channels_channel oc ON oc."orderId" = o.id AND oc."channelId" = $2
             WHERE o.id = ANY($1::int[])`,
            [keys.map(Number), ctx.channelId],
        );
        const byId = new Map(rows.map(row => [String(row.id), row]));
        return keys.map(key => byId.get(key) ?? null);
    }
}
