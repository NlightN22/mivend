import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { randomUUID } from 'node:crypto';

import { ctxQuery } from 'shared';

import { CHECK_CODE_KIND } from './check-stale-request.writer';
import { ChecksService } from './checks.service';

const BATCH = 100;
const LEASE = '5 minutes';
const loggerCtx = 'CheckStaleRequests';

// Extends the claim; throws LeaseLostError once another worker owns the request.
export type StaleRequestHeartbeat = () => Promise<void>;
export type StaleRequestHandler = (
    ctx: RequestContext,
    key: string,
    heartbeat: StaleRequestHeartbeat,
) => Promise<void>;

export class LeaseLostError extends Error {}

interface ClaimedRow {
    id: number;
    kind: string;
    key: string;
    version: number;
}

// Lease claim (docs/concurrency.md (i)): no transaction or lock is held while a handler marks subjects
// in its own short transactions; a token+version fenced delete keeps a re-request made meanwhile.
@Injectable()
export class CheckStaleRequestService {
    private readonly handlers = new Map<string, StaleRequestHandler>();

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private checks: ChecksService,
    ) {
        this.handlers.set(CHECK_CODE_KIND, (ctx, key, heartbeat) =>
            this.checks.markStaleByCheckCode(ctx, key, heartbeat),
        );
    }

    registerHandler(kind: string, handler: StaleRequestHandler): void {
        this.handlers.set(kind, handler);
    }

    drainSoon(): void {
        void this.drain().catch(error =>
            Logger.error(`Stale request drain failed: ${String(error)}`, loggerCtx),
        );
    }

    // One keyset pass, so unprocessable rows (no handler, failing) never starve later ones.
    async drain(ctx?: RequestContext): Promise<number> {
        const runCtx = ctx ?? (await this.requestContextService.create({ apiType: 'admin' }));
        const token = randomUUID();
        let done = 0;
        let lastId = 0;
        for (;;) {
            const rows = await this.claim(runCtx, token, lastId);
            for (const row of rows) {
                if (await this.process(runCtx, token, row)) done += 1;
            }
            if (rows.length < BATCH) return done;
            lastId = rows[rows.length - 1].id;
        }
    }

    private async claim(ctx: RequestContext, token: string, lastId: number): Promise<ClaimedRow[]> {
        const rows = await ctxQuery<[ClaimedRow[], number]>(
            this.connection,
            ctx,
            `UPDATE check_stale_request SET "claimedUntil" = now() + interval '${LEASE}', "claimToken" = $1
              WHERE id IN (SELECT id FROM check_stale_request
                            WHERE ("claimedUntil" IS NULL OR "claimedUntil" < now()) AND id > $2
                            ORDER BY id LIMIT ${BATCH} FOR UPDATE SKIP LOCKED)
             RETURNING id, kind, key, version`,
            [token, lastId],
        );
        return rows[0].sort((a, b) => a.id - b.id);
    }

    private async process(ctx: RequestContext, token: string, row: ClaimedRow): Promise<boolean> {
        const handler = this.handlers.get(row.kind);
        if (!handler) {
            await this.release(ctx, token, row.id);
            return false;
        }
        try {
            await handler(ctx, row.key, () => this.heartbeat(ctx, token, row.id));
        } catch (error) {
            if (error instanceof LeaseLostError) {
                Logger.warn(`Stale request ${row.kind}:${row.key} claimed elsewhere`, loggerCtx);
                return false;
            }
            Logger.error(
                `Stale request ${row.kind}:${row.key} failed, will retry: ${String(error)}`,
                loggerCtx,
            );
            await this.release(ctx, token, row.id);
            return false;
        }
        const [, deleted] = await ctxQuery<[unknown[], number]>(
            this.connection,
            ctx,
            `DELETE FROM check_stale_request WHERE id = $1 AND "claimToken" = $2 AND version = $3`,
            [row.id, token, row.version],
        );
        return deleted > 0;
    }

    private async heartbeat(ctx: RequestContext, token: string, id: number): Promise<void> {
        const [, updated] = await ctxQuery<[unknown[], number]>(
            this.connection,
            ctx,
            `UPDATE check_stale_request SET "claimedUntil" = now() + interval '${LEASE}'
              WHERE id = $1 AND "claimToken" = $2`,
            [id, token],
        );
        if (updated === 0) throw new LeaseLostError(`check_stale_request ${id}`);
    }

    private async release(ctx: RequestContext, token: string, id: number): Promise<void> {
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            `UPDATE check_stale_request SET "claimedUntil" = NULL, "claimToken" = NULL
              WHERE id = $1 AND "claimToken" = $2`,
            [id, token],
        );
    }
}
