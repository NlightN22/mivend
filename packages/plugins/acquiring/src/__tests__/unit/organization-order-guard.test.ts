import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';

import { organizationOrderGuard } from '../../organization-order-guard';

const query = vi.fn();
const injector = {
    get: (token: unknown) =>
        token === TransactionalConnection ? { getRepository: () => ({ query }) } : undefined,
} as unknown as Injector;
const args = { ctx: {} as RequestContext, order: { id: 1 } as unknown as Order };
const end = (toState: OrderState) =>
    organizationOrderGuard.onTransitionEnd?.('AddingItems', toState, args);

beforeEach(() => {
    query.mockReset();
    void organizationOrderGuard.init?.(injector);
});

describe('organizationOrderGuard', () => {
    it("never refuses checkout: a missing organization is the check's finding, not a transition error", () => {
        expect(organizationOrderGuard.onTransitionStart).toBeUndefined();
    });

    it('locks the order row, then stamps the variant organization on entering ArrangingPayment', async () => {
        await end('ArrangingPayment');
        expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(query.mock.calls[1][0]).toContain('UPDATE order_line');
    });

    it('does nothing for other transitions', async () => {
        await end('PaymentAuthorized');
        expect(query).not.toHaveBeenCalled();
    });
});
