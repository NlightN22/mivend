import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';

import {
    organizationOrderGuard,
    ORGANIZATION_MISSING_MESSAGE,
} from '../../organization-order-guard';

const query = vi.fn();
const injector = {
    get: (token: unknown) =>
        token === TransactionalConnection ? { rawConnection: { query } } : undefined,
} as unknown as Injector;
const run = (toState: OrderState) =>
    organizationOrderGuard.onTransitionStart?.('AddingItems', toState, {
        ctx: {} as RequestContext,
        order: { id: 1 } as unknown as Order,
    });

beforeEach(() => {
    query.mockReset();
    void organizationOrderGuard.init?.(injector);
});

describe('organizationOrderGuard', () => {
    it('rejects checkout and names the SKUs that have no organization', async () => {
        query.mockResolvedValue([{ sku: 'SKU-1' }, { sku: 'SKU-2' }]);
        expect(await run('ArrangingPayment')).toBe(`${ORGANIZATION_MISSING_MESSAGE}SKU-1, SKU-2`);
    });

    it('allows checkout when every line has an organization', async () => {
        query.mockResolvedValue([]);
        expect(await run('ArrangingPayment')).toBeUndefined();
    });

    it('does not query for other transitions', async () => {
        expect(await run('PaymentAuthorized')).toBeUndefined();
        expect(await run('AddingItems')).toBeUndefined();
        expect(query).not.toHaveBeenCalled();
    });
});
