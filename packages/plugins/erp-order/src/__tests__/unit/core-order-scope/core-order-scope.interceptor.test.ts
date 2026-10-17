import { describe, expect, it, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import * as core from '@vendure/core';

import { CoreOrderScopeInterceptor } from '../../../core-order-scope/core-order-scope.interceptor';

vi.mock('@vendure/core', async importOriginal => ({
    ...(await importOriginal<typeof import('@vendure/core')>()),
    internal_getRequestContext: vi.fn(),
}));

function run(field: string, parent = 'Mutation', apiType = 'admin', superAdmin = false) {
    vi.mocked(core.internal_getRequestContext).mockReturnValue({
        apiType,
        userHasPermissions: () => superAdmin,
    } as never);
    vi.spyOn(GqlExecutionContext, 'create').mockReturnValue({
        getInfo: () => ({ fieldName: field, parentType: { name: parent } }),
        getArgs: () => ({ id: '2' }),
        getContext: () => ({ req: {} }),
    } as never);
    const scope = { assertInScope: vi.fn(async () => undefined) };
    const next = { handle: vi.fn(() => 'resolved') } as unknown as CallHandler;
    const context = { getType: () => 'graphql' } as unknown as ExecutionContext;
    const result = new CoreOrderScopeInterceptor(scope as never).intercept(context, next);
    return { result, scope };
}

describe('CoreOrderScopeInterceptor', () => {
    it('checks a registered Admin API root operation before core runs', async () => {
        const { result, scope } = run('transitionOrderToState');
        await expect(result).resolves.toBe('resolved');
        expect(scope.assertInScope).toHaveBeenCalledWith(
            expect.anything(),
            'transitionOrderToState',
            { id: '2' },
        );
    });

    it.each([
        ['the Shop API', () => run('cancelOrder', 'Mutation', 'shop')],
        ['a nested field', () => run('order', 'OrderLine')],
        ['an operation outside the registry', () => run('visibleOrders', 'Query')],
        ['a superadmin', () => run('transitionOrderToState', 'Mutation', 'admin', true)],
    ])('does not check %s', async (_label, start) => {
        const { result, scope } = start();
        await expect(result).resolves.toBe('resolved');
        expect(scope.assertInScope).not.toHaveBeenCalled();
    });
});
