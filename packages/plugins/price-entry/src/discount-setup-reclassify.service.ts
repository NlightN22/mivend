import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
    ProcessContext,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { classifySelectionFilter, ctxQuery, replaceFilterTerms, withAggregateLock } from 'shared';

import { loggerCtx } from './types';

export const LEGACY_FILTER_REASON = 'product-filter';
export const AWAITING_REDELIVERY = 'awaiting-redelivery';

interface LegacyRow {
    id: number;
    erpId: string;
    productFilter: unknown[] | null;
}

// One-time, idempotent: rows stored before filters were evaluated carry the legacy reason. Their
// recipients were not stored while inactive, so an evaluable one waits for the ERP to re-send it:
// its version is reset so any re-delivery applies.
@Injectable()
export class DiscountSetupReclassifyService implements OnApplicationBootstrap {
    constructor(
        private connection: TransactionalConnection,
        private requestContextService: RequestContextService,
        private processContext: ProcessContext,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.processContext.isWorker) return;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });
        const count = await this.reclassifyLegacy(ctx);
        if (count > 0)
            Logger.log(`discount-setup: reclassified ${count} legacy filter rows`, loggerCtx);
    }

    async reclassifyLegacy(ctx: RequestContext): Promise<number> {
        const legacy = await ctxQuery<Array<{ erpId: string }>>(
            this.connection,
            ctx,
            `SELECT "erpId" FROM discount_setup WHERE "inactiveReason" = $1`,
            [LEGACY_FILTER_REASON],
        );
        let done = 0;
        for (const { erpId } of legacy) {
            const changed = await withAggregateLock(
                this.connection,
                ctx,
                `discount-setup:${erpId}`,
                txCtx => this.reclassifyOne(txCtx, erpId),
            );
            if (changed) done++;
        }
        return done;
    }

    private async reclassifyOne(txCtx: RequestContext, erpId: string): Promise<boolean> {
        const [row] = await ctxQuery<LegacyRow[]>(
            this.connection,
            txCtx,
            `SELECT id, "erpId", "productFilter" FROM discount_setup
             WHERE "erpId" = $1 AND "inactiveReason" = $2`,
            [erpId, LEGACY_FILTER_REASON],
        );
        if (!row) return false;
        const { terms, reason } = classifySelectionFilter(row.productFilter, 'product');
        await replaceFilterTerms(
            this.connection,
            txCtx,
            { table: 'discount_setup_filter_term', ownerColumn: 'setupId' },
            row.id,
            terms,
        );
        await ctxQuery(
            this.connection,
            txCtx,
            `UPDATE discount_setup
             SET "inactiveReason" = $2,
                 "sourceVersion" = CASE WHEN $3 THEN '0' ELSE "sourceVersion" END,
                 "contentHash" = CASE WHEN $3 THEN '' ELSE "contentHash" END
             WHERE id = $1`,
            [row.id, reason ?? AWAITING_REDELIVERY, reason === null],
        );
        return true;
    }
}
