import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';

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

    // Idempotent; a request that arrived while it ran has a newer version and is kept for the next pass.
    async drain(ctx?: RequestContext): Promise<number> {
        if (this.draining) return 0;
        this.draining = true;
        try {
            const runCtx = ctx ?? (await this.requestContextService.create({ apiType: 'admin' }));
            let done = 0;
            for (;;) {
                const rows: PendingRow[] = await this.connection.rawConnection.query(
                    `SELECT id, kind, key, version FROM check_stale_request ORDER BY id LIMIT ${BATCH}`,
                );
                let progressed = 0;
                for (const row of rows) {
                    const handler = this.handlers.get(row.kind);
                    if (!handler) continue;
                    try {
                        await handler(runCtx, row.key);
                    } catch (error) {
                        Logger.error(
                            `Stale request ${row.kind}:${row.key} failed, will retry: ${String(error)}`,
                            loggerCtx,
                        );
                        continue;
                    }
                    await this.connection.rawConnection.query(
                        `DELETE FROM check_stale_request WHERE id = $1 AND version = $2`,
                        [row.id, row.version],
                    );
                    progressed += 1;
                }
                done += progressed;
                if (rows.length < BATCH || progressed === 0) return done;
            }
        } finally {
            this.draining = false;
        }
    }
}
