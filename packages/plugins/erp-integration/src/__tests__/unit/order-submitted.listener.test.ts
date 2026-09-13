import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderSubmittedListener } from '../../order-submitted.listener';

interface TestLine {
    id: string;
    quantity: number;
    productVariant: {
        productId?: string | null;
        customFields?: { organizationId?: number | null };
    } | null;
}

function makeOrder(lines: TestLine[]): {
    id: string;
    customerId: string;
    totalWithTax: number;
    currencyCode: string;
    lines: TestLine[];
} {
    return { id: 'order-1', customerId: 'cust-1', totalWithTax: 10000, currencyCode: 'RUB', lines };
}

function makeListener(options: {
    order: ReturnType<typeof makeOrder> | null;
    allocations: Array<{
        orderLine: { id: string };
        stockLocation: { customFields?: { warehouseErpId?: string } };
    }>;
    productExternalIds: Record<string, string>;
    counterparty: { erpId: string } | null;
    priceType: { externalId: string | null } | null;
}): {
    listener: OrderSubmittedListener;
    writeToOutbox: ReturnType<typeof vi.fn>;
    dataSource: { transaction: ReturnType<typeof vi.fn> };
} {
    const orderRepo = { findOne: vi.fn().mockResolvedValue(options.order) };
    const allocationRepo = { find: vi.fn().mockResolvedValue(options.allocations) };
    const connection = {
        getRepository: vi.fn((_ctx: unknown, entity: { name?: string }) =>
            entity && entity.name === 'Allocation' ? allocationRepo : orderRepo,
        ),
        rawConnection: {
            createQueryBuilder: vi.fn(() => {
                const rows = Object.entries(options.productExternalIds).map(([id, externalId]) => ({
                    id,
                    externalId,
                }));
                const qb = {
                    select: vi.fn().mockReturnThis(),
                    addSelect: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    getRawMany: vi.fn().mockResolvedValue(rows),
                };
                return qb;
            }),
        },
    };
    const writeToOutbox = vi.fn().mockResolvedValue(undefined);
    const outboxService = { writeToOutbox };
    const dataSource = {
        transaction: vi.fn(async (cb: (em: unknown) => Promise<void>) => cb({})),
    };
    const counterpartyService = { getForCustomer: vi.fn().mockResolvedValue(options.counterparty) };
    const customerPricingService = {
        getCustomerPriceType: vi.fn().mockResolvedValue(options.priceType),
    };
    const eventBus = { ofType: vi.fn(() => ({ subscribe: vi.fn() })) };

    const listener = new OrderSubmittedListener(
        eventBus as never,
        dataSource as never,
        connection as never,
        outboxService as never,
        counterpartyService as never,
        customerPricingService as never,
        { instanceType: 'central' } as never,
    );

    return { listener, writeToOutbox, dataSource };
}

// order-submitted.listener.ts's Allocation repository is looked up via
// connection.getRepository(ctx, Allocation) — the mocked connection above dispatches by the
// entity class's own `name` (real Vendure Allocation class name), avoiding a full @vendure/core
// bootstrap for a unit test, per docs/testing-strategy.md's Unit level. Product.customFields
// .externalId is read via raw SQL (same as price.handler.ts/stock.handler.ts), mocked via
// rawConnection.createQueryBuilder above.
const ctx = {} as RequestContext;
const event = { ctx, orderId: 'order-1', orderCode: 'ORD-001' };

describe('OrderSubmittedListener', () => {
    it('skips the whole order when no Counterparty resolves for the customer', async () => {
        const order = makeOrder([]);
        const { listener, writeToOutbox } = makeListener({
            order,
            allocations: [],
            productExternalIds: {},
            counterparty: null,
            priceType: null,
        });

        await (listener as unknown as { handle: (e: typeof event) => Promise<void> }).handle(event);

        expect(writeToOutbox).not.toHaveBeenCalled();
    });

    it('skips a line missing organizationId, warehouseId, or productId, and reports the rest', async () => {
        const goodLine: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-product-1', customFields: { organizationId: 1 } },
        };
        const missingOrgLine: TestLine = {
            id: 'line-2',
            quantity: 1,
            productVariant: {
                productId: 'variant-product-2',
                customFields: { organizationId: null },
            },
        };
        const order = makeOrder([goodLine, missingOrgLine]);
        const { listener, writeToOutbox } = makeListener({
            order,
            allocations: [
                {
                    orderLine: { id: 'line-1' },
                    stockLocation: { customFields: { warehouseErpId: 'wh-1' } },
                },
                {
                    orderLine: { id: 'line-2' },
                    stockLocation: { customFields: { warehouseErpId: 'wh-1' } },
                },
            ],
            productExternalIds: {
                'variant-product-1': 'product-1',
                'variant-product-2': 'product-2',
            },
            counterparty: { erpId: 'counterparty-1' },
            priceType: { externalId: 'price-type-wholesale' },
        });

        await (listener as unknown as { handle: (e: typeof event) => Promise<void> }).handle(event);

        expect(writeToOutbox).toHaveBeenCalledTimes(1);
        const payload = writeToOutbox.mock.calls[0][1].payload as {
            organizationId: string;
            warehouseId: string;
            customerId: string;
            lines: Array<{ productId: string; quantity: number; priceTypeId: string | null }>;
        };
        expect(payload.organizationId).toBe('1');
        expect(payload.warehouseId).toBe('wh-1');
        expect(payload.customerId).toBe('counterparty-1');
        expect(payload.lines).toEqual([
            { productId: 'product-1', quantity: 2, priceTypeId: 'price-type-wholesale' },
        ]);
    });

    it('fans out into one payload per distinct (organizationId, warehouseId) combination', async () => {
        const lineOrgAWhA: TestLine = {
            id: 'line-1',
            quantity: 1,
            productVariant: { productId: 'variant-1', customFields: { organizationId: 1 } },
        };
        const lineOrgAWhB: TestLine = {
            id: 'line-2',
            quantity: 3,
            productVariant: { productId: 'variant-2', customFields: { organizationId: 1 } },
        };
        const lineOrgB: TestLine = {
            id: 'line-3',
            quantity: 2,
            productVariant: { productId: 'variant-3', customFields: { organizationId: 2 } },
        };
        const order = makeOrder([lineOrgAWhA, lineOrgAWhB, lineOrgB]);
        const { listener, writeToOutbox } = makeListener({
            order,
            allocations: [
                {
                    orderLine: { id: 'line-1' },
                    stockLocation: { customFields: { warehouseErpId: 'wh-A' } },
                },
                {
                    orderLine: { id: 'line-2' },
                    stockLocation: { customFields: { warehouseErpId: 'wh-B' } },
                },
                {
                    orderLine: { id: 'line-3' },
                    stockLocation: { customFields: { warehouseErpId: 'wh-A' } },
                },
            ],
            productExternalIds: {
                'variant-1': 'product-1',
                'variant-2': 'product-2',
                'variant-3': 'product-3',
            },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        await (listener as unknown as { handle: (e: typeof event) => Promise<void> }).handle(event);

        expect(writeToOutbox).toHaveBeenCalledTimes(3);
        const keys = writeToOutbox.mock.calls
            .map(call => call[1].payload as { organizationId: string; warehouseId: string })
            .map(p => `${p.organizationId}:${p.warehouseId}`)
            .sort();
        expect(keys).toEqual(['1:wh-A', '1:wh-B', '2:wh-A']);
    });
});
