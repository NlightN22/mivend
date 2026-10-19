import { Injectable } from '@nestjs/common';
import { RequestContextService, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { ctxQuery } from 'shared';

import {
    replayDidNotResolve,
    REPLAY_WAIT_TIMEOUT_MS,
    timeoutReason,
} from './inbox-replay-lifecycle';

// Every transition is one conditional UPDATE on `status = 'replay_requested'`, so the sweep and the
// processor racing for the same row cannot both win (docs/concurrency.md).
@Injectable()
export class IntegrationInboxReplayStateService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {}

    // failed -> replay_requested; returns the rows this call claimed (a second click gets none).
    async claimForReplay(
        ctx: RequestContext,
        ids: number[],
    ): Promise<Array<{ id: number; stream: string; entityId: string }>> {
        if (ids.length === 0) return [];
        const [rows] = await ctxQuery<[Array<{ id: number; stream: string; entityId: string }>]>(
            this.connection,
            ctx,
            `UPDATE integration_inbox_event
                SET status = 'replay_requested', replay_requested_at = now()
              WHERE id = ANY($1::bigint[]) AND status = 'failed'
          RETURNING id::int AS id, stream, entity_id AS "entityId"`,
            [ids],
        );
        return rows;
    }

    // Replay was not accepted: back to failed, reason annotated.
    async releaseClaim(ctx: RequestContext, ids: number[], reason: string): Promise<void> {
        if (ids.length === 0) return;
        await ctxQuery<unknown>(
            this.connection,
            ctx,
            `UPDATE integration_inbox_event
                SET status = 'failed', replay_requested_at = NULL,
                    last_error = $2
              WHERE id = ANY($1::bigint[]) AND status = 'replay_requested'`,
            [ids, replayDidNotResolve(reason)],
        );
    }

    // replay_requested -> failed for rows whose replay produced nothing usable. Returns the count.
    async expireStale(timeoutMs: number = REPLAY_WAIT_TIMEOUT_MS): Promise<number> {
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const [rows] = await ctxQuery<[Array<{ id: string }>]>(
            this.connection,
            ctx,
            `UPDATE integration_inbox_event r
                SET status = 'failed', replay_requested_at = NULL,
                    last_error = $2 || CASE WHEN EXISTS (
                        SELECT 1 FROM integration_inbox_event n
                         WHERE n.stream = r.stream AND n.entity_id = r.entity_id
                           AND n.created_at >= r.replay_requested_at AND n.status = 'failed')
                        THEN $3 ELSE $4 END
              WHERE r.status = 'replay_requested'
                AND (
                    EXISTS (SELECT 1 FROM integration_inbox_event n
                             WHERE n.stream = r.stream AND n.entity_id = r.entity_id
                               AND n.created_at >= r.replay_requested_at AND n.status = 'failed')
                    OR (r.replay_requested_at < now() - ($1 || ' milliseconds')::interval
                        AND NOT EXISTS (SELECT 1 FROM integration_inbox_event n
                             WHERE n.stream = r.stream AND n.entity_id = r.entity_id
                               AND n.created_at >= r.replay_requested_at
                               AND n.status IN ('pending', 'processing')))
                )
          RETURNING r.id`,
            [
                String(timeoutMs),
                'replay did not resolve: ',
                timeoutReason('newer-event-failed', timeoutMs),
                timeoutReason('no-event-arrived', timeoutMs),
            ],
        );
        return rows.length;
    }
}
