import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

import { contractOrderGuard, CONTRACT_MISSING_MESSAGE } from '../../contract-order-guard';

const query = vi.fn();
const getForCustomer = vi.fn();
const resolveOrderContract = vi.fn();
const injector = {
    get: (token: unknown) => {
        if (token === TransactionalConnection) return { getRepository: () => ({ query }) };
        if (token === CounterpartyService) return { getForCustomer };
        if (token === ContractService) return { resolveOrderContract };
        return undefined;
    },
} as unknown as Injector;

const order = (customerId: number | null = 1) =>
    ({
        id: 7,
        customerId,
        customFields: { selectedContractId: 'picked' },
    }) as unknown as Order;
const args = (o: Order) => ({ ctx: {} as RequestContext, order: o });
const start = (toState: OrderState, o = order()) =>
    contractOrderGuard.onTransitionStart?.('AddingItems', toState, args(o));
const end = (toState: OrderState, o = order()) =>
    contractOrderGuard.onTransitionEnd?.('AddingItems', toState, args(o));

beforeEach(() => {
    query.mockReset();
    getForCustomer.mockReset().mockResolvedValue({ id: 5, mainContractId: 'main' });
    resolveOrderContract.mockReset().mockResolvedValue({ erpId: 'picked' });
    void contractOrderGuard.init?.(injector);
});

describe('contractOrderGuard', () => {
    it('blocks checkout with a clear reason when no active contract resolves', async () => {
        resolveOrderContract.mockResolvedValue(null);
        expect(await start('ArrangingPayment')).toBe(CONTRACT_MISSING_MESSAGE);
    });

    it('blocks checkout when the customer has no counterparty or the order no customer', async () => {
        getForCustomer.mockResolvedValue(null);
        expect(await start('ArrangingPayment')).toBe(CONTRACT_MISSING_MESSAGE);
        expect(await start('ArrangingPayment', order(null))).toBe(CONTRACT_MISSING_MESSAGE);
    });

    it('lets checkout pass and passes the stored selection to the resolver', async () => {
        expect(await start('ArrangingPayment')).toBeUndefined();
        expect(resolveOrderContract).toHaveBeenCalledWith(
            expect.anything(),
            { id: 5, mainContractId: 'main' },
            'picked',
        );
    });

    it('stamps the resolved contract on entering ArrangingPayment, atomically', async () => {
        await end('ArrangingPayment');
        expect(query).toHaveBeenCalledWith(expect.stringContaining('IS DISTINCT FROM $2'), [
            7,
            'picked',
        ]);
    });

    it('does nothing for other transitions', async () => {
        expect(await start('PaymentAuthorized')).toBeUndefined();
        await end('PaymentAuthorized');
        expect(getForCustomer).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });
});
