import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionalConnection } from '@vendure/core';
import type { Injector, Order, OrderState, RequestContext } from '@vendure/core';
import { ContractService, CounterpartyService } from '@mivend/plugin-counterparty';

import { contractOrderGuard } from '../../contract-order-guard';

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
const end = (toState: OrderState, o = order()) =>
    contractOrderGuard.onTransitionEnd?.('AddingItems', toState, args(o));

beforeEach(() => {
    query.mockReset();
    getForCustomer.mockReset().mockResolvedValue({ id: 5, mainContractId: 'main' });
    resolveOrderContract.mockReset().mockResolvedValue({ erpId: 'picked' });
    void contractOrderGuard.init?.(injector);
});

describe('contractOrderGuard', () => {
    it("never refuses checkout: an unresolved contract is the check's finding", () => {
        expect(contractOrderGuard.onTransitionStart).toBeUndefined();
    });

    it('passes the stored selection to the resolver and stamps nothing when none resolves', async () => {
        resolveOrderContract.mockResolvedValue(null);
        await end('ArrangingPayment');
        expect(resolveOrderContract).toHaveBeenCalledWith(
            expect.anything(),
            { id: 5, mainContractId: 'main' },
            'picked',
            1,
        );
        expect(query).toHaveBeenCalledTimes(1);
        expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    });

    it('stamps the resolved contract on entering ArrangingPayment, atomically', async () => {
        await end('ArrangingPayment');
        expect(query).toHaveBeenCalledWith(expect.stringContaining('IS DISTINCT FROM $2'), [
            7,
            'picked',
        ]);
    });

    it('locks the order row before resolving and stamping the contract', async () => {
        await end('ArrangingPayment');
        expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(query.mock.calls[1][0]).toContain('UPDATE "order"');
    });

    it('mirrors the stamp onto the in-memory order so the transition save does not erase it', async () => {
        resolveOrderContract.mockResolvedValue({ erpId: 'resolved' });
        const o = order();
        await end('ArrangingPayment', o);
        expect(o.customFields.selectedContractId).toBe('resolved');
    });

    it('does nothing for other transitions', async () => {
        await end('PaymentAuthorized');
        expect(getForCustomer).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
    });
});
