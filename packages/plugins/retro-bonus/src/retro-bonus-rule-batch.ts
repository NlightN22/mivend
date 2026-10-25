import { Logger } from '@nestjs/common';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { In } from 'typeorm';

import { RetroBonusRule } from './retro-bonus-rule.entity';
import type { RetroBonusRuleUpsertInput } from './retro-bonus-rule.service';
import { loggerCtx } from './types';
import { isVersionNewer } from './version-compare';

const WRITTEN_COLUMNS = [
    'productErpId',
    'counterpartyErpId',
    'recipientContractErpId',
    'priceTypeErpId',
    'isInstant',
    'accrualPeriod',
    'accrualDayNumber',
    'accrualKind',
    'percent',
    'limitAmount',
    'conditionAmount',
    'conditionQuantity',
    'validFrom',
    'validTo',
    'sourceVersion',
] as const;

type RuleValues = Pick<RetroBonusRule, 'erpId' | (typeof WRITTEN_COLUMNS)[number]>;

// Same version guard as upsertRetroBonusRule, replayed in input order over one multi-row upsert.
// The caller holds the per-erpId locks, so the reads below cannot go stale before the write.
export async function upsertRetroBonusRuleBatch(
    connection: TransactionalConnection,
    ctx: RequestContext,
    inputs: RetroBonusRuleUpsertInput[],
): Promise<void> {
    if (inputs.length === 0) return;
    await connection.withTransaction(ctx, async txCtx => {
        const repo = connection.getRepository(txCtx, RetroBonusRule);
        const existing = await repo.find({
            where: { erpId: In([...new Set(inputs.map(i => i.erpId))]) },
        });
        const current = new Map<string, RuleValues>(existing.map(r => [r.erpId, r]));
        const dirty = new Set<string>();
        for (const input of inputs) {
            const stored = current.get(input.erpId);
            if (stored && !isVersionNewer(input.sourceVersion, stored.sourceVersion)) {
                Logger.warn(
                    `retro-bonus-rule ${input.erpId}: update at version=${input.sourceVersion} does ` +
                        `not beat the stored row's own version=${stored.sourceVersion} — skipping`,
                    loggerCtx,
                );
                continue;
            }
            current.set(input.erpId, input);
            dirty.add(input.erpId);
        }
        if (dirty.size === 0) return;
        await repo
            .createQueryBuilder()
            .insert()
            .values([...dirty].map(erpId => current.get(erpId)!) as never)
            .orUpdate([...WRITTEN_COLUMNS, 'updatedAt'], ['erpId'])
            .execute();
    });
}
