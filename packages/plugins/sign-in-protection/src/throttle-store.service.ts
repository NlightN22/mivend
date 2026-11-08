import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import type { CounterState } from './throttle-policy';

@Injectable()
export class ThrottleStoreService {
    constructor(private connection: TransactionalConnection) {}

    private query<T>(ctx: RequestContext, sql: string, params: unknown[]): Promise<T> {
        return ctxQuery<T>(this.connection, ctx, sql, params);
    }

    // One atomic statement: concurrent failures are serialised by the row lock and all counted.
    async recordFailure(ctx: RequestContext, key: string, resetAfterMs: number): Promise<number> {
        const rows = await this.query<Array<{ failures: number }>>(
            ctx,
            `INSERT INTO sign_in_throttle (uuid, "key", failures, "lastFailureAt")
             VALUES ($1, $2, 1, now())
             ON CONFLICT ("key") DO UPDATE SET
               failures = CASE WHEN sign_in_throttle."lastFailureAt" < now() - ($3 * interval '1 millisecond')
                               THEN 1 ELSE sign_in_throttle.failures + 1 END,
               "lastFailureAt" = now(), "updatedAt" = now()
             RETURNING failures`,
            [randomUUID(), key, resetAfterMs],
        );
        return rows[0].failures;
    }

    async read(ctx: RequestContext, keys: string[]): Promise<Map<string, CounterState>> {
        const rows = await this.query<Array<{ key: string; failures: number; ageMs: string }>>(
            ctx,
            `SELECT "key", failures, (extract(epoch FROM (clock_timestamp() - "lastFailureAt")) * 1000)::bigint AS "ageMs"
             FROM sign_in_throttle WHERE "key" = ANY($1)`,
            [keys],
        );
        return new Map(
            rows.map(row => [row.key, { failures: row.failures, ageMs: Number(row.ageMs) }]),
        );
    }

    async reset(ctx: RequestContext, keys: string[]): Promise<void> {
        await this.query(ctx, `DELETE FROM sign_in_throttle WHERE "key" = ANY($1)`, [keys]);
    }

    async deleteStale(ctx: RequestContext, resetAfterMs: number): Promise<number> {
        const rows = await this.query<Array<{ n: number }>>(
            ctx,
            `WITH d AS (DELETE FROM sign_in_throttle
               WHERE "lastFailureAt" < now() - ($1 * interval '1 millisecond') RETURNING 1)
             SELECT count(*)::int AS n FROM d`,
            [resetAfterMs],
        );
        return rows[0]?.n ?? 0;
    }
}
