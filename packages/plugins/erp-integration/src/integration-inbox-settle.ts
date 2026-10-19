import { Logger } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQuery } from 'shared';

import { replayDidNotResolve } from './inbox-replay-lifecycle';
import { NonRetryableInboundError } from './non-retryable-inbound-error';
import { computeRetryBackoffMs } from './retry-policy';
import { INBOX_RETRY_WALL_CLOCK_BUDGET_MS } from './types';

const loggerCtx = 'IntegrationInboxService';

export type InboxOutcome = 'applied' | 'superseded' | 'noop';

export interface BudgetExhaustedNoop {
    outcome: 'noop';
    reason: string;
}

// A claim token, when given, restricts the write to the worker that still holds the claim.
const claimGuard = (claimToken: string | null | undefined, param: number): string =>
    claimToken ? `AND claim_token = $${param}::uuid` : '';

// One statement: marks the row processed and closes any replay_requested row of the same entity
// that was requested before this event arrived (any recorded outcome closes it, noop included).
export async function settleProcessed(
    connection: TransactionalConnection,
    ctx: RequestContext,
    id: number,
    outcome: InboxOutcome,
    outcomeReason: string | null,
    claimToken?: string | null,
): Promise<void> {
    const params: unknown[] = [id, outcome, outcomeReason];
    if (claimToken) params.push(claimToken);
    await ctxQuery<unknown>(
        connection,
        ctx,
        `WITH done AS (
            UPDATE integration_inbox_event
               SET status = 'processed', processed_at = now(), outcome = $2, outcome_reason = $3,
                   claim_token = NULL
             WHERE id = $1 AND status IN ('pending', 'processing') ${claimGuard(claimToken, 4)}
         RETURNING stream, entity_id, created_at)
         UPDATE integration_inbox_event r SET status = 'resolved'
           FROM done
          WHERE r.stream = done.stream AND r.entity_id = done.entity_id
            AND r.status = 'replay_requested' AND r.replay_requested_at <= done.created_at`,
        params,
    );
}

// Retries with backoff, dead-letters after 24h (NonRetryableInboundError at once; onBudgetExhausted may noop).
// The row lock plus the claim guard make the attempt bump and the decision one atomic step.
export async function settleFailed(
    connection: TransactionalConnection,
    ctx: RequestContext,
    id: number,
    error: Error,
    random: () => number,
    onBudgetExhausted: BudgetExhaustedNoop | null,
    claimToken?: string | null,
): Promise<void> {
    const settled = await connection.withTransaction(ctx, async txCtx => {
        const lockParams: unknown[] = [id];
        if (claimToken) lockParams.push(claimToken);
        const rows = await ctxQuery<Array<{ attempts: number; first_failed_at: Date | null }>>(
            connection,
            txCtx,
            `SELECT attempts, first_failed_at FROM integration_inbox_event
              WHERE id = $1 AND status IN ('pending', 'processing') ${claimGuard(claimToken, 2)}
                FOR UPDATE`,
            lockParams,
        );
        if (rows.length === 0) return false;
        const attempts = rows[0].attempts + 1;
        const firstFailedAt = rows[0].first_failed_at ?? new Date();
        const retriable = !(error instanceof NonRetryableInboundError);
        const exhausted =
            !retriable || Date.now() - firstFailedAt.getTime() > INBOX_RETRY_WALL_CLOCK_BUDGET_MS;

        if (!exhausted) {
            const nextRetryAt = new Date(Date.now() + computeRetryBackoffMs(attempts, random));
            // eligible_at mirrors next_retry_at so claimBatch's ordering column stays in step (#147).
            await ctxQuery<unknown>(
                connection,
                txCtx,
                `UPDATE integration_inbox_event
                    SET attempts = $2, first_failed_at = $3, last_error = $4, status = 'pending',
                        next_retry_at = $5, eligible_at = $5, claim_token = NULL
                  WHERE id = $1`,
                [id, attempts, firstFailedAt, error.message, nextRetryAt],
            );
            return true;
        }
        if (retriable && onBudgetExhausted) {
            await ctxQuery<unknown>(
                connection,
                txCtx,
                `UPDATE integration_inbox_event
                    SET attempts = $2, first_failed_at = $3, last_error = $4 WHERE id = $1`,
                [id, attempts, firstFailedAt, error.message],
            );
            // No token: the claim-guarded row lock above already proved this worker holds the claim.
            await settleProcessed(
                connection,
                txCtx,
                id,
                onBudgetExhausted.outcome,
                onBudgetExhausted.reason,
            );
            return true;
        }
        await ctxQuery<unknown>(
            connection,
            txCtx,
            `UPDATE integration_inbox_event
                SET attempts = $2, first_failed_at = $3, last_error = $4, status = 'failed',
                    next_retry_at = NULL, claim_token = NULL
              WHERE id = $1`,
            [id, attempts, firstFailedAt, error.message],
        );
        await ctxQuery<unknown>(
            connection,
            txCtx,
            `UPDATE integration_inbox_event r
                SET status = 'failed', replay_requested_at = NULL, last_error = $2
               FROM integration_inbox_event n
              WHERE n.id = $1 AND r.stream = n.stream AND r.entity_id = n.entity_id
                AND r.status = 'replay_requested' AND r.replay_requested_at <= n.created_at`,
            [id, replayDidNotResolve(`the replayed event failed: ${error.message}`)],
        );
        return true;
    });
    if (!settled) {
        Logger.warn(
            `markFailed skipped: inbox row ${id} is already settled or reclaimed`,
            loggerCtx,
        );
    }
}
