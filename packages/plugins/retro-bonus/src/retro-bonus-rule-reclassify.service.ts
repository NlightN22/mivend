import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import {
    ProcessContext,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { ctxQuery, replaceFilterTerms, withAggregateLock } from 'shared';

import { classifyRule } from './retro-bonus-rule-classify';
import { loggerCtx } from './types';

const LEGACY_REASONS = ['counterparty-filter', 'product-filter'];

interface LegacyRule {
    id: number;
    counterpartyMode: string;
    allCounterparties: boolean;
    counterpartyFilter: unknown[] | null;
    productMode: string;
    allProducts: boolean;
    productFilter: unknown[] | null;
}

// One-time, idempotent: rules stored before filters were evaluated carry a legacy reason and no terms.
@Injectable()
export class RetroBonusRuleReclassifyService implements OnApplicationBootstrap {
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
            Logger.log(`retro-bonus: reclassified ${count} legacy filter rules`, loggerCtx);
    }

    async reclassifyLegacy(ctx: RequestContext): Promise<number> {
        const legacy = await ctxQuery<Array<{ erpId: string }>>(
            this.connection,
            ctx,
            `SELECT "erpId" FROM retro_bonus_rule WHERE "inactiveReason" = ANY($1::text[])`,
            [LEGACY_REASONS],
        );
        let done = 0;
        for (const { erpId } of legacy) {
            const changed = await withAggregateLock(
                this.connection,
                ctx,
                `retro-bonus-rule:${erpId}`,
                txCtx => this.reclassifyOne(txCtx, erpId),
            );
            if (changed) done++;
        }
        return done;
    }

    private async reclassifyOne(txCtx: RequestContext, erpId: string): Promise<boolean> {
        const [rule] = await ctxQuery<LegacyRule[]>(
            this.connection,
            txCtx,
            `SELECT id, "counterpartyMode", "allCounterparties", "counterpartyFilter",
                    "productMode", "allProducts", "productFilter"
             FROM retro_bonus_rule WHERE "erpId" = $1 AND "inactiveReason" = ANY($2::text[])`,
            [erpId, LEGACY_REASONS],
        );
        if (!rule) return false;
        const { terms, inactiveReason } = classifyRule(rule);
        await replaceFilterTerms(
            this.connection,
            txCtx,
            { table: 'retro_bonus_rule_filter_term', ownerColumn: 'ruleId' },
            rule.id,
            terms,
        );
        await ctxQuery(
            this.connection,
            txCtx,
            `UPDATE retro_bonus_rule SET "inactiveReason" = $2 WHERE id = $1`,
            [rule.id, inactiveReason],
        );
        return true;
    }
}
