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
    reservations: Array<{ orderLineId: string; stockLocationId: string; status: string }>;
    warehouseErpIdByLocationId: Record<string, string>;
    productExternalIds: Record<string, string>;
    counterparty: { erpId: string } | null;
    priceType: { externalId: string | null } | null;
}): {
    listener: OrderSubmittedListener;
    writeToOutbox: ReturnType<typeof vi.fn>;
    dataSource: { transaction: ReturnType<typeof vi.fn> };
} {
    const orderRepo = { findOne: vi.fn().mockResolvedValue(options.order) };
    const connection = {
        getRepository: vi.fn(() => orderRepo),
        rawConnection: {
            createQueryBuilder: vi.fn(() => {
                const qb = {
                    __from: '',
                    select: vi.fn().mockReturnThis(),
                    addSelect: vi.fn().mockReturnThis(),
                    from: vi.fn(function (this: typeof qb, table: string) {
                        this.__from = table;
                        return this;
                    }),
                    where: vi.fn().mockReturnThis(),
                    getRawMany: vi.fn(async function (this: typeof qb) {
                        if (qb.__from === 'stock_location') {
                            return Object.entries(options.warehouseErpIdByLocationId).map(
                                ([id, warehouseErpId]) => ({ id, warehouseErpId }),
                            );
                        }
                        return Object.entries(options.productExternalIds).map(
                            ([id, externalId]) => ({ id, externalId }),
                        );
                    }),
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
    const reservationService = {
        findForOrder: vi.fn().mockResolvedValue(options.reservations),
    };
    const eventBus = { ofType: vi.fn(() => ({ subscribe: vi.fn() })) };

    const listener = new OrderSubmittedListener(
        eventBus as never,
        dataSource as never,
        connection as never,
        outboxService as never,
        counterpartyService as never,
        customerPricingService as never,
        reservationService as never,
        { instanceType: 'central' } as never,
    );

    return { listener, writeToOutbox, dataSource };
}

// order-submitted.listener.ts (mivend#85) sources warehouseId from plugin-reservation's
// Reservation entity (via ReservationService.findForOrder), not Vendure's native Allocation —
// see the listener's own doc comment. Product.customFields.externalId and
// StockLocation.customFields.warehouseErpId are both read via raw SQL (same as every other
// cross-plugin customField read in this codebase), mocked via rawConnection.createQueryBuilder
// above, dispatching on the queried table name.
const ctx = {} as RequestContext;
const event = { ctx, orderId: 'order-1', orderCode: 'ORD-001' };

describe('OrderSubmittedListener', () => {
    it('skips the whole order when no Counterparty resolves for the customer', async () => {
        const order = makeOrder([]);
        const { listener, writeToOutbox } = makeListener({
            order,
            reservations: [],
            warehouseErpIdByLocationId: {},
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
            reservations: [
                { orderLineId: 'line-1', stockLocationId: 'location-1', status: 'active' },
                { orderLineId: 'line-2', stockLocationId: 'location-1', status: 'active' },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
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

    it('ignores a released/expired reservation — only active ones count', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-1', customFields: { organizationId: 1 } },
        };
        const order = makeOrder([line]);
        const { listener, writeToOutbox } = makeListener({
            order,
            reservations: [
                { orderLineId: 'line-1', stockLocationId: 'location-1', status: 'released' },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        await (listener as unknown as { handle: (e: typeof event) => Promise<void> }).handle(event);

        expect(writeToOutbox).not.toHaveBeenCalled();
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
            reservations: [
                { orderLineId: 'line-1', stockLocationId: 'location-A', status: 'active' },
                { orderLineId: 'line-2', stockLocationId: 'location-B', status: 'active' },
                { orderLineId: 'line-3', stockLocationId: 'location-A', status: 'active' },
            ],
            warehouseErpIdByLocationId: { 'location-A': 'wh-A', 'location-B': 'wh-B' },
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
