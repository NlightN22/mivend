import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Order } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { OrderContractService } from '../../order-contract.service';
import { ReservationResolver } from '../../reservation.resolver';

// What Vendure's CalculatedPropertySubscriber does on load: calculated getters (taxSummary needs
// the surcharges relation) become own enumerable properties, so spreading the entity evaluates them.
function loadedOrder(customFields: Record<string, unknown>): Order {
    const entity = new Order({ id: 7, customerId: 1 } as never);
    (entity as unknown as { customFields: unknown }).customFields = customFields;
    const names = (
        Order.prototype as unknown as { __calculatedProperties__: Array<{ name: string }> }
    ).__calculatedProperties__.map(p => p.name);
    for (const name of names) {
        const descriptor = Object.getOwnPropertyDescriptor(Order.prototype, name);
        if (descriptor?.get) {
            Object.defineProperty(entity, name, { get: descriptor.get, enumerable: true });
        }
    }
    return entity;
}

const ctx = {} as RequestContext;
const counterparty = { id: 5, mainContractId: 'main' };
const contract = (erpId: string, over: Record<string, unknown> = {}) => ({
    erpId,
    name: erpId,
    counterpartyId: '5',
    organizationId: `org-${erpId}`,
    paymentKind: null,
    isActive: true,
    ...over,
});

let queries: Array<{ sql: string; params: unknown[] }>;
let order: Order;
let reservations: Array<{ status: string }>;
let contractService: {
    findByErpId: ReturnType<typeof vi.fn>;
    findActiveForCounterparty: ReturnType<typeof vi.fn>;
    resolveOrderContract: ReturnType<typeof vi.fn>;
};
let history: { createHistoryEntryForOrder: ReturnType<typeof vi.fn> };
let service: OrderContractService;

beforeEach(() => {
    queries = [];
    order = loadedOrder({ selectedContractId: 'main', erpStatus: null });
    reservations = [];
    const repo = {
        query: vi.fn(async (sql: string, params: unknown[] = []) => {
            queries.push({ sql, params });
            return [];
        }),
    };
    const connection = {
        withTransaction: async (_ctx: unknown, work: (c: unknown) => unknown) => work(ctx),
        getRepository: () => repo,
        rawConnection: { query: vi.fn(async () => []) },
    };
    contractService = {
        findByErpId: vi.fn(async (_c: unknown, erpId: string) => contract(erpId)),
        findActiveForCounterparty: vi.fn(async () => [contract('main'), contract('picked')]),
        resolveOrderContract: vi.fn(async () => contract('picked')),
    };
    history = { createHistoryEntryForOrder: vi.fn(async () => ({})) };
    const visibility = {
        buildVisibleOrdersQuery: vi.fn(async () => {
            const qb = {
                alias: 'order',
                andWhere: vi.fn().mockReturnThis(),
                getOne: vi.fn(async () => order),
            };
            return qb;
        }),
    };
    service = new OrderContractService(
        connection as never,
        { getForCustomer: vi.fn(async () => counterparty) } as never,
        contractService as never,
        visibility as never,
        { findForOrder: vi.fn(async () => reservations) } as never,
        history as never,
    );
});

describe('OrderContractService.set', () => {
    it('writes the new contract under the reserve-order lock and records history', async () => {
        await service.set(ctx, 7, 'picked');

        expect(queries[0].sql).toContain('pg_advisory_xact_lock');
        expect(queries[0].params).toEqual(['reserve-order:7']);
        expect(queries[1].params).toEqual([7, 'picked']);
        expect(history.createHistoryEntryForOrder).toHaveBeenCalledWith(
            expect.objectContaining({
                data: { note: 'Contract changed from main to picked' },
            }),
            false,
        );
    });

    it('rejects a contract of another counterparty or an inactive one', async () => {
        contractService.findByErpId.mockResolvedValue(contract('x', { counterpartyId: '9' }));
        await expect(service.set(ctx, 7, 'x')).rejects.toThrow('cannot be used');
        contractService.findByErpId.mockResolvedValue(contract('x', { isActive: false }));
        await expect(service.set(ctx, 7, 'x')).rejects.toThrow('cannot be used');
        expect(queries.filter(q => q.sql.includes('UPDATE'))).toHaveLength(0);
    });

    it('rejects the change once the order is reserved', async () => {
        reservations = [{ status: 'active' }];
        await expect(service.set(ctx, 7, 'picked')).rejects.toThrow('Release the reservation');
        expect(queries.filter(q => q.sql.includes('UPDATE'))).toHaveLength(0);
    });

    it('rejects the change once the ERP has the order', async () => {
        order = loadedOrder({ erpStatus: 'SENT_TO_ERP' });
        await expect(service.set(ctx, 7, 'picked')).rejects.toThrow('already registered');
    });

    it('does nothing when the contract is unchanged', async () => {
        await service.set(ctx, 7, 'main');
        expect(queries.filter(q => q.sql.includes('UPDATE'))).toHaveLength(0);
        expect(history.createHistoryEntryForOrder).not.toHaveBeenCalled();
    });
});

describe('setOrderContract through the resolver', () => {
    it('answers with the contract options for a real Order entity and persists the change', async () => {
        const resolver = new ReservationResolver(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            service,
        );

        const options = await resolver.setOrderContract(ctx, { orderId: 7, contractId: 'picked' });

        expect(options.map(o => o.erpId)).toEqual(['main', 'picked']);
        expect(queries.some(q => q.sql.includes('UPDATE') && q.params[1] === 'picked')).toBe(true);
        expect(history.createHistoryEntryForOrder).toHaveBeenCalled();
    });
});

describe('OrderContractService.list', () => {
    it('marks the main and the selected contract', async () => {
        const options = await service.list(ctx, 7);
        expect(options.find(o => o.erpId === 'main')?.isMain).toBe(true);
        expect(options.find(o => o.erpId === 'picked')?.isSelected).toBe(true);
    });
});
