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
            accessScopeService.applyOwnCounterpartyFilter(qb, 'c', scope);
            break;
        case 'department': {
            // Only Branch gates visibility (never departmentId); no IS NULL carve-out, so unassigned rows are denied.
            // Union with the caller's own and granted managers' clients (#123).
            const managers = accessScopeService.managerClause(scope, 'c');
            qb.andWhere(`(c.branchId = :scopeBranch${managers ? ` OR ${managers.sql}` : ''})`, {
                scopeBranch: scope.branchId ?? null,
                ...managers?.params,
            });
            break;
        }
        case 'all':
            break;
    }
    return qb;
}
