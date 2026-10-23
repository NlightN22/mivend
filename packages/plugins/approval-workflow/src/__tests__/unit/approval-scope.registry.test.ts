import { describe, expect, it } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import { ApprovalScopeRegistry } from '../../approval-scope.registry';

const ctx = {} as RequestContext;
const registry = (): ApprovalScopeRegistry =>
    new ApprovalScopeRegistry({} as unknown as TransactionalConnection);

describe('ApprovalScopeRegistry.clause', () => {
    it('is null when no rule restricts the caller', async () => {
        const r = registry();
        r.register('a', async () => null);
        expect(await r.clause(ctx)).toBeNull();
    });

    it('keeps unscoped types and renames each rule’s parameters apart', async () => {
        const r = registry();
        r.register('a', async () => ({
            sql: 'x::text IN (:...ids) AND y = :id',
            params: { ids: ['1'], id: '1' },
        }));
        r.register('b', async () => ({ sql: 'z = :id', params: { id: '2' } }));
        const clause = (await r.clause(ctx))!;
        expect(clause.sql).toBe(
            '(request.requestType NOT IN (:...approvalScopedTypes) OR ' +
                '(request.requestType = :approvalScope0_type AND x::text IN (:...approvalScope0_ids) AND y = :approvalScope0_id) OR ' +
                '(request.requestType = :approvalScope1_type AND z = :approvalScope1_id))',
        );
        expect(clause.params).toEqual({
            approvalScopedTypes: ['a', 'b'],
            approvalScope0_type: 'a',
            approvalScope0_ids: ['1'],
            approvalScope0_id: '1',
            approvalScope1_type: 'b',
            approvalScope1_id: '2',
        });
    });
});
