import { Injectable, Logger } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { RetroBonusAccrualKind, RetroBonusRule } from './retro-bonus-rule.entity';
import { loggerCtx } from './types';

export interface RetroBonusRuleUpsertInput {
    erpId: string;
    productErpId: string;
    counterpartyErpId: string;
    recipientContractErpId: string | null;
    priceTypeErpId: string | null;
    isInstant: boolean;
    accrualPeriod: string | null;
    accrualDayNumber: number;
    accrualKind: RetroBonusAccrualKind;
    percent: number;
    limitAmount: number | null;
    conditionAmount: number | null;
    conditionQuantity: number | null;
    validFrom: Date;
    validTo: Date | null;
    sourceVersion: string;
}

// Mirrors plugin-price-entry's counterparty-discount-rule.service.ts — not imported since domain
// plugins never depend on each other, same convention as that file's own comment.
function isVersionNewer(candidate: string, than: string): boolean {
    const a = tryParseBigInt(candidate);
    const b = tryParseBigInt(than);
    if (a !== undefined && b !== undefined) return a > b;
    return candidate > than;
}

function tryParseBigInt(value: string): bigint | undefined {
    if (!/^\d+$/.test(value)) return undefined;
    try {
        return BigInt(value);
    } catch {
        return undefined;
    }
}

// Issue #102: upsert-only, no deactivation/conflict logic — multiple rules can legitimately
// coexist for the same product/counterparty; only a version guard against Kafka redelivery.
@Injectable()
export class RetroBonusRuleService {
    constructor(private connection: TransactionalConnection) {}

    async upsertRetroBonusRule(
        ctx: RequestContext,
        input: RetroBonusRuleUpsertInput,
    ): Promise<RetroBonusRule> {
        const repo = this.connection.getRepository(ctx, RetroBonusRule);
        const existing = await repo.findOne({ where: { erpId: input.erpId } });

        if (existing && !isVersionNewer(input.sourceVersion, existing.sourceVersion)) {
            Logger.warn(
                `retro-bonus-rule ${input.erpId}: update at version=${input.sourceVersion} does ` +
                    `not beat the stored row's own version=${existing.sourceVersion} — skipping`,
                loggerCtx,
            );
            return existing;
        }

        const values: Partial<RetroBonusRule> = {
            erpId: input.erpId,
            productErpId: input.productErpId,
            counterpartyErpId: input.counterpartyErpId,
            recipientContractErpId: input.recipientContractErpId,
            priceTypeErpId: input.priceTypeErpId,
            isInstant: input.isInstant,
            accrualPeriod: input.accrualPeriod,
            accrualDayNumber: input.accrualDayNumber,
            accrualKind: input.accrualKind,
            percent: input.percent,
            limitAmount: input.limitAmount,
            conditionAmount: input.conditionAmount,
            conditionQuantity: input.conditionQuantity,
            validFrom: input.validFrom,
            validTo: input.validTo,
            sourceVersion: input.sourceVersion,
        };

        let record = existing;
        if (record) {
            Object.assign(record, values);
        } else {
            record = repo.create(values);
        }
        return repo.save(record);
    }

    async findForCounterparty(
        ctx: RequestContext,
        counterpartyErpId: string,
        contractErpId?: string,
    ): Promise<RetroBonusRule[]> {
        const repo = this.connection.getRepository(ctx, RetroBonusRule);
        if (contractErpId) {
            return repo.find({
                where: { counterpartyErpId, recipientContractErpId: contractErpId },
            });
        }
        return repo.find({ where: { counterpartyErpId } });
    }
}
