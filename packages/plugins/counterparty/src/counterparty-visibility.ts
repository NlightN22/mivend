import type { RequestContext } from '@vendure/core';
import type { SelectQueryBuilder } from 'typeorm';
import { AccessScopeService } from '@mivend/plugin-access-control';

import { Counterparty } from './entities/counterparty.entity';

export async function applyCounterpartyVisibilityScope(
    accessScopeService: AccessScopeService,
    ctx: RequestContext,
    qb: SelectQueryBuilder<Counterparty>,
): Promise<SelectQueryBuilder<Counterparty>> {
    const scope = await accessScopeService.resolveCounterpartyScope(ctx);
    switch (scope.kind) {
        case 'own':
            accessScopeService.applyOwnCounterpartyFilter(qb, 'c', scope.administratorId);
            break;
        case 'department':
            // Only Branch gates visibility; Department is display-only and departmentId is never compared
            // Null branchId hides the row from branch-scoped roles (deny-by-default); no IS NULL carve-out
            qb.andWhere('c.branchId = :scopeBranch', { scopeBranch: scope.branchId ?? null });
            break;
        case 'all':
            break;
    }
    return qb;
}
