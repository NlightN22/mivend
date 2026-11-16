import { ForbiddenError, RequestContext, TransactionalConnection } from '@vendure/core';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { getRawManyBounded } from 'shared';

import { Counterparty } from './entities/counterparty.entity';
import { applyCounterpartyVisibilityScope } from './counterparty-visibility';

const ID_CHUNK = 5000;

export async function findCounterpartyTarget(
    connection: TransactionalConnection,
    ctx: RequestContext,
    targetId: string,
): Promise<Counterparty | null> {
    if (!/^\d+$/.test(targetId)) return null;
    return connection.getRepository(ctx, Counterparty).findOne({ where: { id: targetId } });
}

export async function isCounterpartyWritable(
    accessScope: AccessScopeService,
    ctx: RequestContext,
    counterparty: Counterparty,
): Promise<boolean> {
    try {
        await accessScope.assertCounterpartyWritable(ctx, counterparty);
        return true;
    } catch (e) {
        if (e instanceof ForbiddenError) return false;
        throw e;
    }
}

// The subset of target ids inside the actor's counterparty scope, for the history list.
export async function visibleCounterpartyTargets(
    connection: TransactionalConnection,
    accessScope: AccessScopeService,
    ctx: RequestContext,
    targetIds: string[],
): Promise<Set<string>> {
    const numeric = [...new Set(targetIds.filter(id => /^\d+$/.test(id)))];
    const visible = new Set<string>();
    for (let i = 0; i < numeric.length; i += ID_CHUNK) {
        const chunk = numeric.slice(i, i + ID_CHUNK);
        const qb = connection
            .getRepository(ctx, Counterparty)
            .createQueryBuilder('c')
            .select('c.id', 'id')
            .where('c.id IN (:...ids)', { ids: chunk });
        const rows = await getRawManyBounded<{ id: number }>(
            await applyCounterpartyVisibilityScope(accessScope, ctx, qb),
            chunk.length,
        );
        for (const row of rows) visible.add(String(row.id));
    }
    return visible;
}
