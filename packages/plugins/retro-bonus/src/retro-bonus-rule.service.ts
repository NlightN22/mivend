import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { contentHash, replaceMembership, withAggregateLock } from 'shared';

import { RetroBonusRule } from './retro-bonus-rule.entity';
import type { RetroBonusAccrualKind, RetroBonusSelectionMode } from './retro-bonus-rule.entity';
import { loggerCtx } from './types';
import { isVersionNewer } from './version-compare';

export interface RetroBonusRuleValues {
    erpId: string;
    documentNumber: string;
    isInstant: boolean;
    accrualPeriod: string | null;
    accrualDayNumber: number;
    accrualKind: RetroBonusAccrualKind;
    percent: number;
    conditionAmount: number | null;
    conditionQuantity: number | null;
    priceTypeErpId: string | null;
    organizationErpId: string | null;
    recipientCounterpartyErpId: string | null;
    recipientContractErpId: string | null;
    validFrom: Date;
    validTo: Date | null;
    allCounterparties: boolean;
    allProducts: boolean;
    counterpartyMode: RetroBonusSelectionMode;
    productMode: RetroBonusSelectionMode;
    counterpartyFilter: unknown[] | null;
    productFilter: unknown[] | null;
    sourceVersion: string;
}

export interface RetroBonusSetupInput {
    rule: RetroBonusRuleValues;
    counterpartyErpIds: string[];
    productErpIds: string[];
}

export type RetroBonusApplyResult = 'applied' | 'unchanged' | 'stale';
export type RetroBonusDeactivateResult = 'deactivated' | 'unknown' | 'stale';

const COUNTERPARTY_LIST = {
    table: 'retro_bonus_rule_counterparty',
    ownerColumn: 'ruleId',
    valueColumn: 'counterpartyErpId',
};
const PRODUCT_LIST = {
    table: 'retro_bonus_rule_product',
    ownerColumn: 'ruleId',
    valueColumn: 'productErpId',
};

export function unevaluatedReason(rule: RetroBonusRuleValues): string | null {
    if (rule.counterpartyMode === 'filter' && !rule.allCounterparties) return 'counterparty-filter';
    if (rule.productMode === 'filter' && !rule.allProducts) return 'product-filter';
    return null;
}

// Issue #102/#289: one row per ERP setup document; a newer version replaces the whole rule and both lists.
@Injectable()
export class RetroBonusRuleService {
    constructor(private connection: TransactionalConnection) {}

    apply(ctx: RequestContext, input: RetroBonusSetupInput): Promise<RetroBonusApplyResult> {
        const { rule } = input;
        return withAggregateLock(
            this.connection,
            ctx,
            `retro-bonus-rule:${rule.erpId}`,
            async txCtx => {
                const repo = this.connection.getRepository(txCtx, RetroBonusRule);
                const existing = await repo.findOne({ where: { erpId: rule.erpId } });
                if (existing && !isVersionNewer(rule.sourceVersion, existing.sourceVersion)) {
                    Logger.warn(
                        `retro-bonus-rule ${rule.erpId}: version=${rule.sourceVersion} does not beat the stored version=${existing.sourceVersion}, skipping`,
                        loggerCtx,
                    );
                    return 'stale';
                }
                const counterparties = rule.allCounterparties ? [] : input.counterpartyErpIds;
                const products = rule.allProducts ? [] : input.productErpIds;
                const hash = contentHash({ ...rule, sourceVersion: undefined }, [
                    counterparties,
                    products,
                ]);
                const unchanged = existing !== null && existing.contentHash === hash;
                const wasActive = existing?.active === true;
                const values = {
                    ...rule,
                    active: true,
                    inactiveReason: unevaluatedReason(rule),
                    contentHash: hash,
                };
                const saved = await repo.save(
                    existing ? Object.assign(existing, values) : repo.create(values),
                );
                if (unchanged) return wasActive ? 'unchanged' : 'applied';
                const ruleId = saved.id as number;
                await replaceMembership(
                    this.connection,
                    txCtx,
                    COUNTERPARTY_LIST,
                    ruleId,
                    counterparties,
                );
                await replaceMembership(this.connection, txCtx, PRODUCT_LIST, ruleId, products);
                return 'applied';
            },
        );
    }

    // A tombstone older than the stored version is a replay and changes nothing; at an equal version it
    // applies only while the row is still active. Only a strictly newer upsert reactivates.
    deactivate(
        ctx: RequestContext,
        erpId: string,
        version: string,
    ): Promise<RetroBonusDeactivateResult> {
        return withAggregateLock(this.connection, ctx, `retro-bonus-rule:${erpId}`, async txCtx => {
            const repo = this.connection.getRepository(txCtx, RetroBonusRule);
            const existing = await repo.findOne({ where: { erpId } });
            if (!existing) return 'unknown';
            const newer = isVersionNewer(version, existing.sourceVersion);
            if (!newer && !(version === existing.sourceVersion && existing.active)) return 'stale';
            existing.active = false;
            if (newer) existing.sourceVersion = version;
            await repo.save(existing);
            return 'deactivated';
        });
    }

    findForCounterparty(
        ctx: RequestContext,
        counterpartyErpId: string,
        contractErpId?: string,
    ): Promise<RetroBonusRule[]> {
        const qb = this.connection
            .getRepository(ctx, RetroBonusRule)
            .createQueryBuilder('r')
            .where('r.active = true')
            .andWhere(
                `(r.allCounterparties = true OR r.recipientCounterpartyErpId = :counterpartyErpId
                  OR EXISTS (SELECT 1 FROM retro_bonus_rule_counterparty m
                             WHERE m."ruleId" = r.id AND m."counterpartyErpId" = :counterpartyErpId))`,
                { counterpartyErpId },
            );
        if (contractErpId) {
            qb.andWhere(
                '(r.recipientContractErpId IS NULL OR r.recipientContractErpId = :contractErpId)',
                {
                    contractErpId,
                },
            );
        }
        return qb.orderBy('r.validFrom', 'DESC').getMany();
    }
}
