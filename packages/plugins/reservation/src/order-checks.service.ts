import { Injectable, Logger } from '@nestjs/common';
import { EntityNotFoundError, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CheckRegistry, CheckResult, ChecksService } from '@mivend/plugin-checks';
import type { CheckRunResult } from '@mivend/plugin-checks';
import { randomUUID } from 'node:crypto';
import { withSavepoint } from 'shared';

import { ORDER_SUBJECT_TYPE } from './order-check-subject';
import type { OrderCheckStage } from './order-check-subject';
import { OrderCheckSubjectRegistrar } from './order-check-subject.registrar';
import { loggerCtx } from './types';
import type { ReservationCreationMethod } from './types';

const MAX_FAILURE_MESSAGE = 500;
const FAILURE_RETENTION_DAYS = 30;

// The single caller of runChecks for orders: keeps one current result set per order and the list flag.
@Injectable()
export class OrderChecksService {
    constructor(
        private connection: TransactionalConnection,
        private checks: ChecksService,
        private registry: CheckRegistry,
        private registrar: OrderCheckSubjectRegistrar,
    ) {}

    async run(
        ctx: RequestContext,
        orderId: string,
        stage: OrderCheckStage,
    ): Promise<CheckRunResult> {
        // runChecks takes the order lock first; it is held to the end of this transaction, so the cleanup below is covered.
        return this.connection.withTransaction(ctx, async txCtx => {
            const result = await this.checks.runChecks(txCtx, ORDER_SUBJECT_TYPE, orderId, stage);
            // Every stage evaluates the same facts, so the newest run supersedes older stages' rows.
            const codes = this.registry.listForStage(ORDER_SUBJECT_TYPE, stage).map(p => p.code);
            const repo = this.connection.getRepository(txCtx, CheckResult);
            if (codes.length > 0) {
                await repo
                    .createQueryBuilder()
                    .delete()
                    .where('"subjectType" = :type AND "subjectId" = :orderId', {
                        type: ORDER_SUBJECT_TYPE,
                        orderId,
                    })
                    .andWhere('stage <> :stage AND "checkCode" IN (:...codes)', { stage, codes })
                    .execute();
            }
            await this.syncFlag(txCtx, orderId);
            return result;
        });
    }

    // An auto trigger that hits `hold` leaves the order in the manual confirmation queue; staff
    // confirming it manually is the release.
    // Fail-open by owner decision (docs/checks-and-policies.md): a broken check never stops an order.
    async isHeld(
        ctx: RequestContext,
        orderId: string,
        trigger: ReservationCreationMethod,
    ): Promise<boolean> {
        const automatic = trigger !== 'manual';
        const stages: OrderCheckStage[] = automatic
            ? ['pre-reserve', 'pre-send-to-erp']
            : ['pre-reserve'];
        let stage: OrderCheckStage = stages[0];
        try {
            return await this.connection.withTransaction(ctx, txCtx =>
                withSavepoint(this.connection, txCtx, async () => {
                    let held = false;
                    for (stage of stages) {
                        const { strongestConsequence } = await this.run(txCtx, orderId, stage);
                        held = held || strongestConsequence === 'hold';
                    }
                    return automatic && held;
                }),
            );
        } catch (error) {
            this.recordFailure(orderId, stage, error);
            return false;
        }
    }

    // Deferred and not awaited: the caller still holds a pool connection, so waiting for a second one
    // could exhaust the pool under mass failure. Own connection, so a rollback of the caller keeps it.
    recordFailure(orderId: string, stage: OrderCheckStage, error: unknown): void {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(
            `Order checks failed for order ${orderId} at ${stage}, continuing: ${message}`,
            error instanceof Error ? error.stack : undefined,
            loggerCtx,
        );
        setImmediate(() => {
            this.connection.rawConnection
                .query(
                    `INSERT INTO order_check_failure ("uuid", "orderId", "stage", "message") VALUES ($1, $2, $3, $4)`,
                    [randomUUID(), orderId, stage, message.slice(0, MAX_FAILURE_MESSAGE)],
                )
                .catch((recordError: unknown) =>
                    Logger.error(
                        `Could not record the check failure: ${String(recordError)}`,
                        undefined,
                        loggerCtx,
                    ),
                );
        });
    }

    async pruneFailures(): Promise<number> {
        const result: unknown[] = await this.connection.rawConnection.query(
            `DELETE FROM order_check_failure WHERE "createdAt" < now() - interval '${FAILURE_RETENTION_DAYS} days' RETURNING id`,
        );
        return result.length;
    }

    async recompute(ctx: RequestContext, orderId: string): Promise<CheckResult[]> {
        const visible = await this.registrar.visibleIds(ctx, [orderId]);
        if (!visible.has(orderId)) throw new EntityNotFoundError('Order', orderId);
        await this.run(ctx, orderId, 'on-edit');
        return this.checks.findResults(ctx, ORDER_SUBJECT_TYPE, orderId);
    }

    private async syncFlag(ctx: RequestContext, orderId: string): Promise<void> {
        const count = await this.connection
            .getRepository(ctx, CheckResult)
            .count({ where: { subjectType: ORDER_SUBJECT_TYPE, subjectId: orderId } });
        const repo = this.connection.getRepository(ctx, Order);
        const current = await repo.findOne({ where: { id: orderId } });
        if (!current || current.customFields?.hasCheckFindings === count > 0) return;
        await repo.update(orderId, { customFields: { hasCheckFindings: count > 0 } });
    }
}
