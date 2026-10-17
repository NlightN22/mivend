import { describe, expect, it, vi } from 'vitest';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { EntityNotFoundError } from '@vendure/core';
import * as core from '@vendure/core';

import { CoreOrderScopeInterceptor } from '../../../core-order-scope/core-order-scope.interceptor';
import type { OrderTargetKind } from '../../../core-order-scope/core-order-operations';
import { OrderTargetService } from '../../../core-order-scope/order-target.service';

vi.mock('@vendure/core', async importOriginal => ({
    ...(await importOriginal<typeof import('@vendure/core')>()),
    internal_getRequestContext: vi.fn(),
}));

interface Setup {
    field: string;
    args: Record<string, unknown>;
    parent?: string;
    apiType?: 'admin' | 'shop';
    superAdmin?: boolean;
    owners?: Partial<Record<OrderTargetKind, Record<string, string>>>;
    visible?: string[];
    customerlessDrafts?: string[];
}

function run(s: Setup) {
    vi.mocked(core.internal_getRequestContext).mockReturnValue({
        apiType: s.apiType ?? 'admin',
        userHasPermissions: () => s.superAdmin ?? false,
    } as never);
    vi.spyOn(GqlExecutionContext, 'create').mockReturnValue({
        getInfo: () => ({ fieldName: s.field, parentType: { name: s.parent ?? 'Mutation' } }),
        getArgs: () => s.args,
        getContext: () => ({ req: {} }),
    } as never);
    const targets = new OrderTargetService({} as never);
    vi.spyOn(targets, 'orderIds').mockImplementation(async (_ctx, kind, ids) =>
        ids.flatMap(id => (s.owners?.[kind]?.[String(id)] ? [s.owners[kind][String(id)]] : [])),
    );
    vi.spyOn(targets, 'customerlessDraftIds').mockImplementation(
        async (_ctx, ids) =>
            new Set(ids.map(String).filter(id => (s.customerlessDrafts ?? []).includes(id))),
    );
    const visibleIds = vi.fn(
        async (_ctx: unknown, ids: unknown[]) =>
            new Set(ids.map(String).filter(id => (s.visible ?? []).includes(id))),
    );
    const interceptor = new CoreOrderScopeInterceptor({ visibleIds } as never, targets);
    const next = { handle: vi.fn(() => 'resolved') } as unknown as CallHandler;
    const context = { getType: () => 'graphql' } as unknown as ExecutionContext;
    return { result: interceptor.intercept(context, next), next, visibleIds };
}

const ownOrder = { order: { '1': '1' } };
const foreignOrder = { order: { '2': '2' } };

describe('CoreOrderScopeInterceptor', () => {
    it('lets an in-scope administrator read and change an order', async () => {
        for (const [field, args] of [
            ['order', { id: '1' }],
            ['transitionOrderToState', { id: '1', state: 'Cancelled' }],
        ] as const) {
            const { result, next } = run({
                field,
                args,
                parent: field === 'order' ? 'Query' : 'Mutation',
                owners: ownOrder,
                visible: ['1'],
            });
            await expect(result).resolves.toBe('resolved');
            expect(next.handle).toHaveBeenCalled();
        }
    });

    it.each([
        ['order (read)', 'order', { id: '2' }, foreignOrder, 'Query'],
        [
            'transitionOrderToState',
            'transitionOrderToState',
            { id: '2', state: 'Cancelled' },
            foreignOrder,
            'Mutation',
        ],
        ['cancelOrder', 'cancelOrder', { input: { orderId: '2' } }, foreignOrder, 'Mutation'],
        [
            'modifyOrder',
            'modifyOrder',
            { input: { orderId: '2', dryRun: false } },
            foreignOrder,
            'Mutation',
        ],
        [
            'addNoteToOrder',
            'addNoteToOrder',
            { input: { id: '2', note: 'x', isPublic: false } },
            foreignOrder,
            'Mutation',
        ],
        [
            'setOrderCustomFields',
            'setOrderCustomFields',
            { input: { id: '2' } },
            foreignOrder,
            'Mutation',
        ],
        [
            'draft edit',
            'addItemToDraftOrder',
            { orderId: '2', input: {} },
            foreignOrder,
            'Mutation',
        ],
        ['settlePayment', 'settlePayment', { id: 'p2' }, { payment: { p2: '2' } }, 'Mutation'],
        [
            'refundOrder',
            'refundOrder',
            { input: { paymentId: 'p2' } },
            { payment: { p2: '2' } },
            'Mutation',
        ],
        [
            'settleRefund',
            'settleRefund',
            { input: { id: 'r2' } },
            { refund: { r2: '2' } },
            'Mutation',
        ],
        [
            'transitionFulfillmentToState',
            'transitionFulfillmentToState',
            { id: 'f2', state: 'Shipped' },
            { fulfillment: { f2: '2' } },
            'Mutation',
        ],
        [
            'addFulfillmentToOrder',
            'addFulfillmentToOrder',
            { input: { lines: [{ orderLineId: 'l2', quantity: 1 }] } },
            { orderLine: { l2: '2' } },
            'Mutation',
        ],
        [
            'deleteOrderNote',
            'deleteOrderNote',
            { id: 'n2' },
            { orderNote: { n2: '2' } },
            'Mutation',
        ],
    ])(
        'an out-of-scope %s is not found and never reaches core',
        async (_label, field, args, owners, parent) => {
            const { result, next } = run({ field, args, parent, owners, visible: ['1'] });
            await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
            expect(next.handle).not.toHaveBeenCalled();
        },
    );

    it('refuses a modifyOrder that refunds a payment of a foreign order', async () => {
        const { result } = run({
            field: 'modifyOrder',
            args: { input: { orderId: '1', refunds: [{ paymentId: 'p2' }] } },
            owners: { order: { '1': '1' }, payment: { p2: '2' } },
            visible: ['1'],
        });
        await expect(result).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('lets the creator set a customer on a fresh customerless draft', async () => {
        const { result } = run({
            field: 'setCustomerForDraftOrder',
            args: { orderId: '3', customerId: 'c1' },
            owners: { order: { '3': '3' } },
            customerlessDrafts: ['3'],
        });
        await expect(result).resolves.toBe('resolved');
    });

    it('leaves an unknown id to core', async () => {
        const { result } = run({ field: 'order', args: { id: '404' }, parent: 'Query' });
        await expect(result).resolves.toBe('resolved');
    });

    it('does not scope a superadmin', async () => {
        const { result, visibleIds } = run({
            field: 'transitionOrderToState',
            args: { id: '2' },
            owners: foreignOrder,
            superAdmin: true,
        });
        await expect(result).resolves.toBe('resolved');
        expect(visibleIds).not.toHaveBeenCalled();
    });

    it('ignores the Shop API, nested fields and operations outside the registry', async () => {
        for (const s of [
            { field: 'cancelOrder', args: { code: 'X' }, apiType: 'shop' as const },
            { field: 'order', args: { id: '2' }, parent: 'OrderLine' },
            { field: 'visibleOrders', args: {}, parent: 'Query' },
        ]) {
            const { result } = run({ ...s, owners: foreignOrder });
            await expect(result).resolves.toBe('resolved');
        }
    });
});
