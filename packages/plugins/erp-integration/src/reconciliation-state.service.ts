import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { getRawManyBounded, withAggregateLock } from 'shared';
import { In } from 'typeorm';

import { ErpReconciliationNotFound } from './entities/erp-reconciliation-not-found.entity';
import { ErpReconciliationState } from './entities/erp-reconciliation-state.entity';
import { decideHeal, judgeHeal } from './reconciliation-heal-policy';
import type { HealDecision, HealOutcome } from './reconciliation-heal-policy';
import { FAILED_OUTCOMES } from './reconciliation-heal-policy';
import { filterFor } from './reconciliation-filters';
import { nextComparison, quietReason } from './reconciliation-state';
import type { ComparisonSignals } from './reconciliation-state';

export interface RecordComparisonInput {
    aggregateType: string;
    ourCount: number;
    theirCount: number;
    signals: ComparisonSignals;
    now: Date;
}

export interface FinishHealInput {
    outcome: HealOutcome;
    detail: string;
    realRun: boolean;
    success: boolean;
}

export type ReconciliationKindView = Omit<ErpReconciliationState, 'assignUuid'> & {
    filter: string;
    explainedGap: number;
};

const lockKey = (aggregateType: string): string => `erp-reconciliation:${aggregateType}`;

// Every read-compute-write of a state row runs under the per-aggregate lock; no external call is made while it is held.
@Injectable()
export class ReconciliationStateService {
    constructor(private readonly connection: TransactionalConnection) {}

    async record(
        ctx: RequestContext,
        input: RecordComparisonInput,
    ): Promise<ErpReconciliationState> {
        return withAggregateLock(
            this.connection,
            ctx,
            lockKey(input.aggregateType),
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, ErpReconciliationState);
                const previous = await repo.findOne({
                    where: { aggregateType: input.aggregateType },
                });
                const outcome = nextComparison({
                    ourCount: input.ourCount,
                    theirCount: input.theirCount,
                    signals: input.signals,
                    now: input.now,
                    previous: previous
                        ? {
                              state: previous.state,
                              gap: previous.gap,
                              flatRuns: previous.flatRuns,
                              seedingSince: previous.seedingSince,
                              lastRunAt: previous.lastRunAt,
                          }
                        : null,
                });
                const verdict =
                    outcome.state === 'in-sync' || !previous
                        ? { attempts: 0, pending: false }
                        : judgeHeal({
                              attempts: previous.healAttempts,
                              pending: previous.healVerdictPending,
                              quiet:
                                  quietReason(input.signals) === null &&
                                  outcome.reason !== 'too-soon',
                              previousGap: previous.gap,
                              newGap: outcome.gap,
                          });
                const fields = {
                    state: outcome.state,
                    reason: outcome.reason,
                    ourCount: input.ourCount,
                    theirCount: input.theirCount,
                    gap: outcome.gap,
                    flatRuns: outcome.flatRuns,
                    seedingSince: outcome.seedingSince,
                    seedingAlarm: outcome.seedingAlarm,
                    inboxBacklog: input.signals.inboxBacklog,
                    sourceQueue: input.signals.sourceQueue ?? null,
                    lastRunAt: input.now,
                    healAttempts: verdict.attempts,
                    healVerdictPending: verdict.pending,
                };
                if (previous) {
                    await repo.update(previous.id, fields);
                } else {
                    await repo.save(
                        new ErpReconciliationState({
                            uuid: randomUUID(),
                            aggregateType: input.aggregateType,
                            ...fields,
                        }),
                    );
                }
                return repo.findOneOrFail({ where: { aggregateType: input.aggregateType } });
            },
        );
    }

    // The throttle timestamp is written before any request goes out, so a concurrent runner is refused.
    async claimHeal(
        ctx: RequestContext,
        aggregateType: string,
        now: Date,
        healKeyConfigured: boolean,
    ): Promise<HealDecision> {
        return withAggregateLock(this.connection, ctx, lockKey(aggregateType), async txCtx => {
            const repo = this.connection.getRepository(txCtx, ErpReconciliationState);
            const row = await repo.findOne({ where: { aggregateType } });
            if (!row) return { heal: false, reason: 'not-stalled' };
            const decision = decideHeal({
                state: row.state,
                gap: row.gap,
                attempts: row.healAttempts,
                lastRequestedAt: row.healRequestedAt,
                now,
                healKeyConfigured,
            });
            if (decision.heal) await repo.update(row.id, { healRequestedAt: now });
            return decision;
        });
    }

    // A failed outcome adds an attempt; success is judged by the next comparison (attemptsAfterComparison).
    async finishHeal(
        ctx: RequestContext,
        aggregateType: string,
        input: FinishHealInput,
    ): Promise<ErpReconciliationState> {
        return withAggregateLock(this.connection, ctx, lockKey(aggregateType), async txCtx => {
            const repo = this.connection.getRepository(txCtx, ErpReconciliationState);
            const row = await repo.findOneOrFail({ where: { aggregateType } });
            const failed = FAILED_OUTCOMES.includes(input.outcome);
            await repo.update(row.id, {
                healAttempts: row.healAttempts + (failed ? 1 : 0),
                healVerdictPending: input.outcome === 'healed',
                healOutcome: input.outcome,
                healDetail: input.detail.slice(0, 250),
                healRealRun: input.realRun,
            });
            return repo.findOneOrFail({ where: { aggregateType } });
        });
    }

    async rememberNotFound(
        ctx: RequestContext,
        aggregateType: string,
        ids: string[],
    ): Promise<void> {
        if (ids.length === 0) return;
        await this.connection
            .getRepository(ctx, ErpReconciliationNotFound)
            .createQueryBuilder()
            .insert()
            .values(ids.map(entityId => ({ aggregateType, entityId, uuid: randomUUID() })))
            .orIgnore()
            .execute();
    }

    async knownNotFound(
        ctx: RequestContext,
        aggregateType: string,
        candidates: string[],
    ): Promise<Set<string>> {
        const known = new Set<string>();
        for (let i = 0; i < candidates.length; i += 1000) {
            const rows = await this.connection.getRepository(ctx, ErpReconciliationNotFound).find({
                where: { aggregateType, entityId: In(candidates.slice(i, i + 1000)) },
                select: { entityId: true },
                take: 1000,
            });
            for (const row of rows) known.add(row.entityId);
        }
        return known;
    }

    async countNotFound(ctx: RequestContext, aggregateType: string): Promise<number> {
        return this.connection
            .getRepository(ctx, ErpReconciliationNotFound)
            .count({ where: { aggregateType } });
    }

    async listViews(ctx: RequestContext): Promise<ReconciliationKindView[]> {
        const rows = await this.connection
            .getRepository(ctx, ErpReconciliationState)
            .find({ order: { aggregateType: 'ASC' }, take: 200 });
        const grouped = await getRawManyBounded<{ aggregateType: string; n: string }>(
            this.connection
                .getRepository(ctx, ErpReconciliationNotFound)
                .createQueryBuilder('nf')
                .select('nf.aggregateType', 'aggregateType')
                .addSelect('COUNT(*)', 'n')
                .groupBy('nf.aggregateType'),
        );
        const explained = new Map(grouped.map(g => [g.aggregateType, Number(g.n)]));
        return rows.map(row => ({
            ...row,
            filter: filterFor(row.aggregateType).description,
            explainedGap: Math.min(explained.get(row.aggregateType) ?? 0, Math.max(row.gap, 0)),
        }));
    }
}
