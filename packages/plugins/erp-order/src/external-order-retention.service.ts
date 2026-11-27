import { Injectable } from '@nestjs/common';
import {
    GlobalSettingsService,
    Logger,
    Order,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { withAggregateLock } from 'shared';

import { externalOrderLockKey } from './external-order.service';
import {
    REMOVABLE_EXTERNAL_ORDER_PREDICATE,
    REMOVE_EXTERNAL_ORDER_SQL,
} from './external-order-retention.sql';
import './types';

export const DEFAULT_EXTERNAL_ORDER_RETENTION_MONTHS = 12;
export const MAX_EXTERNAL_ORDER_RETENTION_MONTHS = 600;
const BATCH_SIZE = 200;
const MAX_BATCHES_PER_RUN = 25;
const loggerCtx = 'ExternalOrderRetention';

// Same cut as the sweep predicate: orderPlacedAt < now() - window.
export function isBeyondRetention(
    orderDate: Date,
    months: number,
    now: Date = new Date(),
): boolean {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
    return orderDate < cutoff;
}

@Injectable()
export class ExternalOrderRetentionService {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly globalSettingsService: GlobalSettingsService,
    ) {}

    async retentionMonths(ctx: RequestContext): Promise<number> {
        const settings = await this.globalSettingsService.getSettings(ctx);
        const months = settings.customFields?.externalOrderRetentionMonths;
        return months && months >= 1 && months <= MAX_EXTERNAL_ORDER_RETENTION_MONTHS
            ? Math.floor(months)
            : DEFAULT_EXTERNAL_ORDER_RETENTION_MONTHS;
    }

    async isBeyondWindow(ctx: RequestContext, orderDate: Date): Promise<boolean> {
        return isBeyondRetention(orderDate, await this.retentionMonths(ctx));
    }

    // Each delete re-checks the predicate under the order's lock, so an order the ERP un-marked or
    // re-sent concurrently is not removed from under the writer.
    async sweep(ctx: RequestContext): Promise<number> {
        const months = await this.retentionMonths(ctx);
        const repo = this.connection.getRepository(ctx, Order);
        let removed = 0;
        let lastId = 0;
        for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch += 1) {
            const candidates: Array<{ id: number; erpOrderId: string }> = await repo.query(
                `SELECT o.id, o."customFieldsErporderid" AS "erpOrderId" FROM "order" o
                 WHERE o.id > $2 AND ${REMOVABLE_EXTERNAL_ORDER_PREDICATE}
                 ORDER BY o.id LIMIT ${BATCH_SIZE}`,
                [months, lastId],
            );
            for (const candidate of candidates) {
                removed += await this.removeIfStillRemovable(ctx, candidate, months);
            }
            if (candidates.length < BATCH_SIZE) break;
            lastId = candidates[candidates.length - 1].id;
        }
        Logger.info(
            `External order retention: removed ${removed} deletion-marked order(s) older than ${months} month(s)`,
            loggerCtx,
        );
        return removed;
    }

    private removeIfStillRemovable(
        ctx: RequestContext,
        candidate: { id: number; erpOrderId: string },
        months: number,
    ): Promise<number> {
        return withAggregateLock(
            this.connection,
            ctx,
            externalOrderLockKey(candidate.erpOrderId),
            async txCtx => {
                const rows: unknown[] = await this.connection
                    .getRepository(txCtx, Order)
                    .query(REMOVE_EXTERNAL_ORDER_SQL, [months, candidate.id]);
                return rows.length;
            },
        );
    }
}
