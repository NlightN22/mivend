import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Counterparty } from '@mivend/plugin-counterparty';
import { CtxLoader, ctxQuery } from 'shared';

// The order's own counterparty wins; ERP-originated and retail orders carry it only there.
@Injectable()
export class OrderCounterpartyLoader {
    private byOrder = new CtxLoader<Counterparty | null>((ctx, keys) => this.load(ctx, keys));

    constructor(private connection: TransactionalConnection) {}

    forOrder(ctx: RequestContext, orderId: string | number): Promise<Counterparty | null> {
        return this.byOrder.load(ctx, orderId);
    }

    private async load(
        ctx: RequestContext,
        keys: readonly string[],
    ): Promise<Array<Counterparty | null>> {
        const rows = await ctxQuery<Array<Counterparty & { orderId: string }>>(
            this.connection,
            ctx,
            `SELECT c.*, o.id AS "orderId" FROM "order" o
             LEFT JOIN customer cu ON cu.id = o."customerId"
             INNER JOIN counterparty c
               ON c.id::text = COALESCE(o."customFieldsCounterpartyid", cu."customFieldsCounterpartyid")
             WHERE o.id = ANY($1::int[])`,
            [keys.map(Number)],
        );
        const byId = new Map<string, Counterparty>();
        for (const { orderId, ...counterparty } of rows) {
            byId.set(String(orderId), counterparty as Counterparty);
        }
        return keys.map(key => byId.get(key) ?? null);
    }
}
