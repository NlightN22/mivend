import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CtxLoader, ctxQuery } from 'shared';

export interface OrderRef {
    id: string;
    code: string;
}

export interface VersionRef {
    id: string;
    number: string;
    version: number;
}

// Batches the {id, code} / {id, number, version} references that list rows resolve one by one.
@Injectable()
export class ProformaInvoiceRefLoader {
    constructor(private connection: TransactionalConnection) {}

    private orders = new CtxLoader<OrderRef>((ctx, keys) => this.loadOrders(ctx, keys));
    private versions = new CtxLoader<VersionRef | null>((ctx, keys) =>
        this.loadVersions(ctx, keys),
    );

    order(ctx: RequestContext, orderId: number): Promise<OrderRef> {
        return this.orders.load(ctx, orderId);
    }

    version(ctx: RequestContext, proformaInvoiceId: number): Promise<VersionRef | null> {
        return this.versions.load(ctx, proformaInvoiceId);
    }

    // Same channel rule as OrderService.findOne; a missing order fails only its own key.
    private async loadOrders(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<OrderRef | Error>> {
        const rows = await ctxQuery<Array<{ id: number; code: string }>>(
            this.connection,
            ctx,
            `SELECT o.id, o.code FROM "order" o
             JOIN order_channels_channel oc ON oc."orderId" = o.id AND oc."channelId" = $2
             WHERE o.id = ANY($1::int[])`,
            [keys.map(Number), ctx.channelId],
        );
        const byId = new Map(rows.map(row => [String(row.id), row.code]));
        return keys.map(key => {
            const code = byId.get(key);
            return code === undefined
                ? new Error(`Order ${key} not found for a proforma invoice`)
                : { id: key, code };
        });
    }

    private async loadVersions(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<VersionRef | null>> {
        const rows = await ctxQuery<Array<{ id: number; number: string; version: number }>>(
            this.connection,
            ctx,
            'SELECT id, number, version FROM proforma_invoice WHERE id = ANY($1::int[])',
            [keys.map(Number)],
        );
        const byId = new Map(rows.map(row => [String(row.id), row]));
        return keys.map(key => {
            const row = byId.get(key);
            return row ? { id: String(row.id), number: row.number, version: row.version } : null;
        });
    }
}
