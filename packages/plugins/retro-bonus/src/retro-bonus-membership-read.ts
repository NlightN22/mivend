import { RequestContext, TransactionalConnection } from '@vendure/core';
import { MoreThan } from 'typeorm';
import { KEYSET_BATCH_SIZE, KEYSET_CEILING, readAllByKeysetWarned } from 'shared';

import { RetroBonusRuleProduct } from './retro-bonus-rule-membership.entity';
import { loggerCtx } from './types';

export const MEMBERSHIP_BATCH_SIZE = KEYSET_BATCH_SIZE;

export async function loadProductMembers(
    connection: TransactionalConnection,
    ctx: RequestContext,
    ruleIds: number[],
    batchSize: number = MEMBERSHIP_BATCH_SIZE,
    ceiling: number = KEYSET_CEILING,
): Promise<Map<number, Set<string>>> {
    const repo = connection.getRepository(ctx, RetroBonusRuleProduct);
    const members = new Map<number, Set<string>>();
    for (const ruleId of ruleIds) {
        const rows = await readAllByKeysetWarned<{ id: string }>(
            async (afterId, take) =>
                (
                    await repo.find({
                        where: { ruleId, productErpId: MoreThan(afterId ?? '') },
                        order: { productErpId: 'ASC' },
                        take,
                    })
                ).map(row => ({ id: row.productErpId })),
            loggerCtx,
            batchSize,
            ceiling,
        );
        members.set(ruleId, new Set(rows.map(row => row.id)));
    }
    return members;
}
