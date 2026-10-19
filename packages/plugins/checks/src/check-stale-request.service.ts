import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';

import { ctxQuery } from 'shared';

import { CHECK_CODE_KIND } from './check-stale-request.writer';
import { ChecksService } from './checks.service';

const BATCH = 100;
const loggerCtx = 'CheckStaleRequests';

export type StaleRequestHandler = (ctx: RequestContext, key: string) => Promise<void>;

interface PendingRow {
    id: number;
    kind: string;
    key: string;
    version: number;
}

// The handler transaction only writes a request row; marking runs here in short per-subject
// transactions and is retried until the request is gone, so no lock is held across a bulk load.
@Injectable()
export class CheckStaleRequestService {
    private readonly handlers = new Map<string, StaleRequestHandler>();
    private draining = false;

    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private checks: ChecksService,
    ) {
        this.handlers.set(CHECK_CODE_KIND, (ctx, key) =>
            this.checks.markStaleByCheckCode(ctx, key),
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

    // One keyset pass over every row, so unprocessable rows (no handler, failing) never starve later ones;
    // they stay for the next pass. Idempotent; a request repeated meanwhile has a newer version and is kept.
    async drain(ctx?: RequestContext): Promise<number> {
        if (this.draining) return 0;
        this.draining = true;
        try {
            const runCtx = ctx ?? (await this.requestContextService.create({ apiType: 'admin' }));
            let done = 0;
            let lastId = 0;
            for (;;) {
                const rows = await ctxQuery<PendingRow[]>(
                    this.connection,
                    runCtx,
                    `SELECT id, kind, key, version FROM check_stale_request WHERE id > $1 ORDER BY id LIMIT ${BATCH}`,
                    [lastId],
                );
                for (const row of rows) {
                    if (await this.process(runCtx, row)) done += 1;
                }
                if (rows.length < BATCH) return done;
                lastId = rows[rows.length - 1].id;
            }
        } finally {
            this.draining = false;
        }
    }

    // A transaction-level advisory try-lock instead of a row lock: another process (the scheduled task vs
    // the post-commit drain) skips a request being worked on, and the writer's upsert never waits for it.
    private async process(ctx: RequestContext, row: PendingRow): Promise<boolean> {
        const handler = this.handlers.get(row.kind);
        if (!handler) return false;
        return this.connection.withTransaction(ctx, async txCtx => {
            const [{ locked }] = await ctxQuery<Array<{ locked: boolean }>>(
                this.connection,
                txCtx,
                `SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked`,
                [`check-stale-request:${row.id}`],
            );
            if (!locked) return false;
            try {
                await handler(ctx, row.key);
            } catch (error) {
                Logger.error(
                    `Stale request ${row.kind}:${row.key} failed, will retry: ${String(error)}`,
                    loggerCtx,
                );
                return false;
            }
            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                `DELETE FROM check_stale_request WHERE id = $1 AND version = $2`,
                [row.id, row.version],
            );
            return true;
        });
    }
}
