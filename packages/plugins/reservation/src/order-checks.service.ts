import { Injectable, Logger } from '@nestjs/common';
import { EntityNotFoundError, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CheckRegistry, CheckResult, ChecksService } from '@mivend/plugin-checks';
import type { CheckRunResult } from '@mivend/plugin-checks';
import { withAggregateLock } from 'shared';

import { ORDER_SUBJECT_TYPE, orderLockKey } from './order-check-subject';
import type { OrderCheckStage } from './order-check-subject';
import { OrderCheckSubjectRegistrar } from './order-check-subject.registrar';
import { loggerCtx } from './types';
import type { ReservationCreationMethod } from './types';

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
        return withAggregateLock(this.connection, ctx, orderLockKey(orderId), async txCtx => {
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
    // confirming it manually is the release. A failing provider never stops the order flow.
    async isHeld(
        ctx: RequestContext,
        orderId: string,
        trigger: ReservationCreationMethod,
    ): Promise<boolean> {
        const automatic = trigger !== 'manual';
        const stages: OrderCheckStage[] = automatic
            ? ['pre-reserve', 'pre-send-to-erp']
            : ['pre-reserve'];
        try {
            let held = false;
            for (const stage of stages) {
                const { strongestConsequence } = await this.run(ctx, orderId, stage);
                held = held || strongestConsequence === 'hold';
            }
            return automatic && held;
        } catch (error) {
            Logger.error(
                `Order checks failed for order ${orderId}, continuing: ${String(error)}`,
                undefined,
                loggerCtx,
            );
            return false;
        }
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
