import { Logger } from '@vendure/core';
import { DataSource, EntityManager } from 'typeorm';

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
    runner: Pick<EntityManager, 'query'>,
    id: number,
    outcome: InboxOutcome,
    outcomeReason: string | null,
    claimToken?: string | null,
): Promise<void> {
    const params: unknown[] = [id, outcome, outcomeReason];
    if (claimToken) params.push(claimToken);
    await runner.query(
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

// Failures retry with backoff and dead-letter only after 24h from the first failure;
// NonRetryableInboundError fails at once. onBudgetExhausted can turn a kind into a noop instead.
// The row lock plus the claim guard make the attempt bump and the decision one atomic step.
export async function settleFailed(
    dataSource: DataSource,
    id: number,
    error: Error,
    random: () => number,
    onBudgetExhausted: BudgetExhaustedNoop | null,
    claimToken?: string | null,
): Promise<void> {
    const settled = await dataSource.transaction(async em => {
        const lockParams: unknown[] = [id];
        if (claimToken) lockParams.push(claimToken);
        const rows = await em.query<Array<{ attempts: number; first_failed_at: Date | null }>>(
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
            await em.query(
                `UPDATE integration_inbox_event
                    SET attempts = $2, first_failed_at = $3, last_error = $4, status = 'pending',
                        next_retry_at = $5, eligible_at = $5, claim_token = NULL
                  WHERE id = $1`,
                [id, attempts, firstFailedAt, error.message, nextRetryAt],
            );
            return true;
        }
        if (retriable && onBudgetExhausted) {
            await em.query(
                `UPDATE integration_inbox_event
                    SET attempts = $2, first_failed_at = $3, last_error = $4 WHERE id = $1`,
                [id, attempts, firstFailedAt, error.message],
            );
            await settleProcessed(em, id, onBudgetExhausted.outcome, onBudgetExhausted.reason);
            return true;
        }
        await em.query(
            `UPDATE integration_inbox_event
                SET attempts = $2, first_failed_at = $3, last_error = $4, status = 'failed',
                    next_retry_at = NULL, claim_token = NULL
              WHERE id = $1`,
            [id, attempts, firstFailedAt, error.message],
        );
        await em.query(
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
