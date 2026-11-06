import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

export interface ActingContext {
    administratorId: string;
    tradingPointId: string | null;
}

// Reads the acting flag from the session row: the session cache holds no custom fields.
@Injectable()
export class ActingContextService {
    // Per-request memo: preferred-point lookups run once per order line.
    private memo = new WeakMap<RequestContext, Promise<ActingContext | null>>();

    constructor(private connection: TransactionalConnection) {}

    get(ctx: RequestContext): Promise<ActingContext | null> {
        let pending = this.memo.get(ctx);
        if (!pending) {
            pending = this.load(ctx);
            this.memo.set(ctx, pending);
        }
        return pending;
    }

    private async load(ctx: RequestContext): Promise<ActingContext | null> {
        const token = ctx.session?.token;
        if (!token) return null;
        const rows = await ctxQuery<
            Array<{ administratorId: string | null; tradingPointId: string | null }>
        >(
            this.connection,
            ctx,
            `SELECT "customFieldsActingadministratorid" AS "administratorId",
                    "customFieldsActingtradingpointid" AS "tradingPointId"
             FROM session WHERE token = $1 AND invalidated = false`,
            [token],
        );
        const row = rows[0];
        if (!row?.administratorId) return null;
        return { administratorId: row.administratorId, tradingPointId: row.tradingPointId };
    }

    async setTradingPoint(ctx: RequestContext, tradingPointId: string): Promise<void> {
        this.memo.delete(ctx);
        await ctxQuery(
            this.connection,
            ctx,
            `UPDATE session SET "customFieldsActingtradingpointid" = $2
             WHERE token = $1 AND "customFieldsActingadministratorid" IS NOT NULL`,
            [ctx.session?.token, tradingPointId],
        );
    }
}
