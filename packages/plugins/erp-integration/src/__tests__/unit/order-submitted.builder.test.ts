import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

const ctx = {} as RequestContext;

import { OrderSubmittedBuilder } from '../../order-submitted.builder';
import type { OutboundBuildResult } from '../../outbound-gateway';

interface TestLine {
    id: string;
    quantity: number;
    customFields?: { organizationId?: number | null };
    productVariant: { productId?: string | null } | null;
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

function makeBuilder(options: {
    order: ReturnType<typeof makeOrder> | null;
    reservations: Array<{ orderLineId: string; stockLocationId: string; status: string }>;
    warehouseErpIdByLocationId: Record<string, string>;
    productExternalIds: Record<string, string>;
    counterparty: { erpId: string } | null;
    priceType: { externalId: string | null } | null;
}): OrderSubmittedBuilder {
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
                        if (qb.__from === 'organization_requisites') {
                            return [1, 2].map(id => ({ id, erpId: `org-erp-${id}` }));
                        }
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
    const counterpartyService = { getForCustomer: vi.fn().mockResolvedValue(options.counterparty) };
    const customerPricingService = {
        getCustomerPriceType: vi.fn().mockResolvedValue(options.priceType),
    };
    const reservationService = {
        findForOrder: vi.fn().mockResolvedValue(options.reservations),
    };

    return new OrderSubmittedBuilder(
        connection as never,
        counterpartyService as never,
        customerPricingService as never,
        reservationService as never,
    );
}

const build = (builder: OrderSubmittedBuilder): Promise<OutboundBuildResult> =>
    builder.build(ctx, 'order-1', 'ORD-001');

// warehouseId comes from plugin-reservation's Reservation entity (mivend#85); the two customField
// reads go through raw SQL, mocked via rawConnection.createQueryBuilder by table name.

describe('OrderSubmittedBuilder', () => {
    it('skips the whole order when no Counterparty resolves for the customer', async () => {
        const order = makeOrder([{ id: 'line-1', quantity: 1, productVariant: null }]);
        const builder = makeBuilder({
            order,
            reservations: [],
            warehouseErpIdByLocationId: {},
            productExternalIds: {},
            counterparty: null,
            priceType: null,
        });

        const result = await build(builder);

        expect(result).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('no Counterparty'),
        });
    });

    it('skips the whole order, naming the line, when one line misses organizationId', async () => {
        const goodLine: TestLine = {
            id: 'line-1',
            quantity: 2,
            customFields: { organizationId: 1 },
            productVariant: { productId: 'variant-product-1' },
        };
        const missingOrgLine: TestLine = {
            id: 'line-2',
            quantity: 1,
            customFields: { organizationId: null },
            productVariant: { productId: 'variant-product-2' },
        };
        const order = makeOrder([goodLine, missingOrgLine]);
        const builder = makeBuilder({
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

        const result = await build(builder);

        expect(result).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('line line-2 (organizationId=undefined'),
        });
    });

    it('builds a send result when every line resolves', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            customFields: { organizationId: 1 },
            productVariant: { productId: 'variant-product-1' },
        };
        const builder = makeBuilder({
            order: makeOrder([line]),
            reservations: [
                { orderLineId: 'line-1', stockLocationId: 'location-1', status: 'active' },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-product-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: { externalId: 'price-type-wholesale' },
        });

        const result = await build(builder);

        expect(result.kind).toBe('send');
        const payload = (result as Extract<OutboundBuildResult, { kind: 'send' }>).events[0]
            .payload as {
            organizationId: string;
            warehouseId: string;
            customerId: string;
            lines: unknown[];
        };
        expect(payload).toMatchObject({
            organizationId: 'org-erp-1',
            warehouseId: 'wh-1',
            customerId: 'counterparty-1',
        });
        expect(payload.lines).toEqual([
            { productId: 'product-1', quantity: 2, priceTypeId: 'price-type-wholesale' },
        ]);
    });

    it('ignores a released/expired reservation — only active ones count', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            customFields: { organizationId: 1 },
            productVariant: { productId: 'variant-1' },
        };
        const order = makeOrder([line]);
        const builder = makeBuilder({
            order,
            reservations: [
                { orderLineId: 'line-1', stockLocationId: 'location-1', status: 'released' },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        const result = await build(builder);

        expect(result).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('warehouseId=undefined'),
        });
    });

    it('fans out into one payload per distinct (organizationId, warehouseId) combination', async () => {
        const lineOrgAWhA: TestLine = {
            id: 'line-1',
            quantity: 1,
            customFields: { organizationId: 1 },
            productVariant: { productId: 'variant-1' },
        };
        const lineOrgAWhB: TestLine = {
            id: 'line-2',
            quantity: 3,
            customFields: { organizationId: 1 },
            productVariant: { productId: 'variant-2' },
        };
        const lineOrgB: TestLine = {
            id: 'line-3',
            quantity: 2,
            customFields: { organizationId: 2 },
            productVariant: { productId: 'variant-3' },
        };
        const order = makeOrder([lineOrgAWhA, lineOrgAWhB, lineOrgB]);
        const builder = makeBuilder({
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

        const result = await build(builder);

        expect(result.kind).toBe('send');
        const events = (result as Extract<OutboundBuildResult, { kind: 'send' }>).events;
        const keys = events
            .map(e => e.payload as { organizationId: string; warehouseId: string })
            .map(p => `${p.organizationId}:${p.warehouseId}`)
            .sort();
        expect(keys).toEqual(['org-erp-1:wh-A', 'org-erp-1:wh-B', 'org-erp-2:wh-A']);
    });

    it('skips an order that cannot be found', async () => {
        const builder = makeBuilder({
            order: null,
            reservations: [],
            warehouseErpIdByLocationId: {},
            productExternalIds: {},
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        expect(await build(builder)).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('not found'),
        });
    });
});
