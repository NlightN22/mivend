import { RequestContext, TransactionalConnection } from '@vendure/core';
import { MoreThan } from 'typeorm';

import { RetroBonusRuleProduct } from './retro-bonus-rule-membership.entity';

export const MEMBERSHIP_BATCH_SIZE = 1000;

export async function loadProductMembers(
    connection: TransactionalConnection,
    ctx: RequestContext,
    ruleIds: number[],
): Promise<Map<number, Set<string>>> {
    const repo = connection.getRepository(ctx, RetroBonusRuleProduct);
    const members = new Map<number, Set<string>>();
    for (const ruleId of ruleIds) {
        const set = new Set<string>();
        let last = '';
        for (;;) {
            const batch = await repo.find({
                where: { ruleId, productErpId: MoreThan(last) },
                order: { productErpId: 'ASC' },
                take: MEMBERSHIP_BATCH_SIZE,
            });
            for (const row of batch) set.add(row.productErpId);
            if (batch.length < MEMBERSHIP_BATCH_SIZE) break;
            last = batch[batch.length - 1].productErpId;
        }
        members.set(ruleId, set);
    }
    return members;
}
