import { describe, expect, it, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

const ctx = {} as RequestContext;

import { OrderSubmittedBuilder } from '../../order-submitted.builder';
import type { OutboundBuildResult } from '../../outbound-gateway';
import { ORDER_EVENTS_SCHEMA } from '../../schemas/order-events.schema';

interface TestLine {
    id: string;
    quantity: number;
    productVariant: {
        productId?: string | null;
        customFields?: { defaultSalesUnitId?: string | null; unitRatioToBase?: number | null };
    } | null;
    customFields?: { uuid: string };
}

function makeOrder(
    lines: TestLine[],
    customFields: {
        selectedContractId: string | null;
        erpStatus?: string | null;
        uuid?: string;
    } = {
        selectedContractId: 'contract-1',
    },
): {
    id: string;
    customerId: string;
    totalWithTax: number;
    currencyCode: string;
    customFields: { selectedContractId: string | null; erpStatus?: string | null; uuid: string };
    lines: TestLine[];
} {
    return {
        id: 'order-1',
        customerId: 'cust-1',
        totalWithTax: 10000,
        currencyCode: 'RUB',
        customFields: { uuid: 'order-uuid-1', ...customFields },
        lines: lines.map(line => ({ customFields: { uuid: `${line.id}-uuid` }, ...line })),
    };
}

function makeBuilder(options: {
    order: ReturnType<typeof makeOrder> | null;
    reservations: Array<{
        orderLineId: string;
        stockLocationId: string;
        status: string;
        expiresAt: Date;
    }>;
    warehouseErpIdByLocationId: Record<string, string>;
    productExternalIds: Record<string, string>;
    counterparty: { erpId: string } | null;
    priceType: { externalId: string | null } | null;
    contract?: { erpId: string; organizationId: string } | null;
    packagesOnly?: boolean;
    priorOutboxEntries?: Array<{ payload: { orderId?: string }; status: string }>;
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
    const contractService = {
        resolveOrderContract: vi
            .fn()
            .mockResolvedValue(
                options.contract === undefined
                    ? { erpId: 'contract-1', organizationId: 'org-erp-1' }
                    : options.contract,
            ),
    };
    const customerPricingService = {
        getCustomerPriceType: vi.fn().mockResolvedValue(options.priceType),
    };
    const reservationService = {
        findForOrder: vi.fn().mockResolvedValue(options.reservations),
    };
    const priorEntries = options.priorOutboxEntries ?? [];
    const outboundGateway = {
        hasActiveEntry: vi.fn(async (_eventType: string, orderId: string) =>
            priorEntries.some(
                entry =>
                    entry.payload.orderId === orderId &&
                    (entry.status === 'pending' || entry.status === 'published'),
            ),
        ),
    };

    return new OrderSubmittedBuilder(
        connection as never,
        counterpartyService as never,
        contractService as never,
        customerPricingService as never,
        reservationService as never,
        outboundGateway as never,
        {
            resolveEffective: vi.fn(async () => ({ packagesOnly: options.packagesOnly === true })),
        } as never,
    );
}

const reservation = (
    orderLineId: string,
    stockLocationId: string,
    expiresAt = '2026-10-09T10:00:00.000Z',
): { orderLineId: string; stockLocationId: string; status: string; expiresAt: Date } => ({
    orderLineId,
    stockLocationId,
    status: 'active',
    expiresAt: new Date(expiresAt),
});

const build = (builder: OrderSubmittedBuilder): Promise<OutboundBuildResult> =>
    builder.build(ctx, 'order-1', 'ORD-001');

// warehouseId comes from plugin-reservation's Reservation entity (mivend#85); the two customField
// reads go through raw SQL, mocked via rawConnection.createQueryBuilder by table name.

describe('OrderSubmittedBuilder', () => {
    const packLine = (): TestLine => ({
        id: 'line-1',
        quantity: 9,
        productVariant: {
            productId: 'v-1',
            customFields: { defaultSalesUnitId: 'unit-pack', unitRatioToBase: 0.9 },
        },
    });
    const buildPackOrder = (packagesOnly: boolean): Promise<OutboundBuildResult> =>
        build(
            makeBuilder({
                order: makeOrder([packLine()]),
                reservations: [
                    {
                        orderLineId: 'line-1',
                        stockLocationId: 'location-1',
                        status: 'active',
                        expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                    },
                ],
                warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
                productExternalIds: { 'v-1': 'product-1' },
                counterparty: { erpId: 'counterparty-1' },
                priceType: null,
                packagesOnly,
            }),
        );

    it('sends unitId and the quantity in the sales unit when the branch is packages-only', async () => {
        const result = await buildPackOrder(true);
        expect(result).toMatchObject({
            kind: 'send',
            events: [{ payload: { lines: [{ unitId: 'unit-pack', quantity: 10 }] } }],
        });
    });

    it('sends base quantity with no unitId when the branch sells by the piece', async () => {
        const result = await buildPackOrder(false);
        const line = (
            result as unknown as {
                events: Array<{ payload: { lines: Array<Record<string, unknown>> } }>;
            }
        ).events[0].payload.lines[0];
        expect(line.quantity).toBe(9);
        expect(line).not.toHaveProperty('unitId');
    });

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

    it('skips the whole order when no active contract can register it', async () => {
        const line: TestLine = { id: 'line-1', quantity: 1, productVariant: { productId: 'v-1' } };
        const builder = makeBuilder({
            order: makeOrder([line]),
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'active',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'v-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
            contract: null,
        });

        expect(await build(builder)).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('no active contract'),
        });
    });

    it('skips the whole order, naming the line, when one line has no warehouse', async () => {
        const goodLine: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-product-1' },
        };
        const noWarehouseLine: TestLine = {
            id: 'line-2',
            quantity: 1,
            productVariant: { productId: 'variant-product-2' },
        };
        const builder = makeBuilder({
            order: makeOrder([goodLine, noWarehouseLine]),
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'active',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: {
                'variant-product-1': 'product-1',
                'variant-product-2': 'product-2',
            },
            counterparty: { erpId: 'counterparty-1' },
            priceType: { externalId: 'price-type-wholesale' },
        });

        expect(await build(builder)).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('line line-2 (warehouseId=undefined'),
        });
    });

    it('builds a send result when every line resolves', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-product-1' },
        };
        const builder = makeBuilder({
            order: makeOrder([line]),
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'active',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
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
            contractId: string;
            warehouseId: string;
            customerId: string;
            orderUuid: string;
            orderNumber: string;
            lines: unknown[];
        };
        expect(payload).toMatchObject({
            organizationId: 'org-erp-1',
            contractId: 'contract-1',
            warehouseId: 'wh-1',
            customerId: 'counterparty-1',
            orderUuid: 'order-uuid-1',
            orderNumber: 'ORD-001',
        });
        expect(payload.lines).toEqual([
            {
                productId: 'product-1',
                quantity: 2,
                priceTypeId: 'price-type-wholesale',
                lineUuid: 'line-1-uuid',
            },
        ]);
    });

    it('ignores a released/expired reservation — only active ones count', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-1' },
        };
        const order = makeOrder([line]);
        const builder = makeBuilder({
            order,
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'released',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        const result = await build(builder);

        expect(result).toEqual({
            kind: 'skip',
            reason: 'order has no active reservation',
        });
    });

    it('sends ONE payload per order in the warehouse holding the most quantity', async () => {
        const lines: TestLine[] = [
            { id: 'line-1', quantity: 1, productVariant: { productId: 'variant-1' } },
            { id: 'line-2', quantity: 3, productVariant: { productId: 'variant-2' } },
            { id: 'line-3', quantity: 1, productVariant: { productId: 'variant-3' } },
        ];
        const builder = makeBuilder({
            order: makeOrder(lines),
            reservations: [
                reservation('line-1', 'location-A', '2026-10-09T12:00:00.000Z'),
                reservation('line-2', 'location-B', '2026-10-09T10:00:00.000Z'),
                reservation('line-3', 'location-A', '2026-10-09T11:00:00.000Z'),
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
        expect(events).toHaveLength(1);
        const payload = events[0].payload as {
            warehouseId: string;
            lines: unknown[];
            type: string;
            reserveUntil: string;
            eventId: string;
        };
        expect(payload).toMatchObject({
            warehouseId: 'wh-B',
            type: 'confirmed',
            reserveUntil: '2026-10-09T10:00:00.000Z',
        });
        expect(payload.lines).toHaveLength(3);
        expect(events[0].eventId).toBe(payload.eventId);
    });

    it('breaks a quantity tie by the lowest warehouse id', async () => {
        const lines: TestLine[] = [
            { id: 'line-1', quantity: 2, productVariant: { productId: 'variant-1' } },
            { id: 'line-2', quantity: 2, productVariant: { productId: 'variant-2' } },
        ];
        const builder = makeBuilder({
            order: makeOrder(lines),
            reservations: [
                reservation('line-1', 'location-B'),
                reservation('line-2', 'location-A'),
            ],
            warehouseErpIdByLocationId: { 'location-A': 'wh-A', 'location-B': 'wh-B' },
            productExternalIds: { 'variant-1': 'product-1', 'variant-2': 'product-2' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        const result = await build(builder);

        const events = (result as Extract<OutboundBuildResult, { kind: 'send' }>).events;
        expect((events[0].payload as { warehouseId: string }).warehouseId).toBe('wh-A');
    });

    it('produces a payload that validates against the confirmed branch of the union schema', async () => {
        const builder = makeBuilder({
            order: makeOrder([
                { id: 'line-1', quantity: 2, productVariant: { productId: 'variant-1' } },
            ]),
            reservations: [reservation('line-1', 'location-A')],
            warehouseErpIdByLocationId: { 'location-A': 'wh-A' },
            productExternalIds: { 'variant-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        const result = (await build(builder)) as Extract<OutboundBuildResult, { kind: 'send' }>;
        const payload = result.events[0].payload;
        const [confirmed] = ORDER_EVENTS_SCHEMA.oneOf;

        expect(confirmed.required.filter(key => payload[key] === undefined)).toEqual([]);
        expect(payload.type).toBe(confirmed.properties.type.const);
        expect(Number.isNaN(Date.parse(String(payload.reserveUntil)))).toBe(false);
    });

    it('skips a re-confirm (or release/expiry then reconfirm) of an already-queued order — issue #199', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-product-1' },
        };
        const builder = makeBuilder({
            order: makeOrder([line]),
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'active',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-product-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: { externalId: 'price-type-wholesale' },
            priorOutboxEntries: [{ payload: { orderId: 'order-1' }, status: 'published' }],
        });

        const result = await build(builder);

        expect(result).toEqual({
            kind: 'skip',
            reason: expect.stringContaining('already submitted'),
        });
    });

    it('allows a re-submit once the ERP rejected the previous submission (decision 5)', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-product-1' },
        };
        const builder = makeBuilder({
            order: makeOrder([line], { selectedContractId: 'contract-1', erpStatus: 'REJECTED' }),
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'active',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-product-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: { externalId: 'price-type-wholesale' },
            priorOutboxEntries: [{ payload: { orderId: 'order-1' }, status: 'published' }],
        });

        const result = await build(builder);

        expect(result.kind).toBe('send');
    });

    it('does not block on a prior skipped entry for the same order', async () => {
        const line: TestLine = {
            id: 'line-1',
            quantity: 2,
            productVariant: { productId: 'variant-product-1' },
        };
        const builder = makeBuilder({
            order: makeOrder([line]),
            reservations: [
                {
                    orderLineId: 'line-1',
                    stockLocationId: 'location-1',
                    status: 'active',
                    expiresAt: new Date('2026-10-09T10:00:00.000Z'),
                },
            ],
            warehouseErpIdByLocationId: { 'location-1': 'wh-1' },
            productExternalIds: { 'variant-product-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: { externalId: 'price-type-wholesale' },
            priorOutboxEntries: [{ payload: { orderId: 'order-1' }, status: 'skipped' }],
        });

        const result = await build(builder);

        expect(result.kind).toBe('send');
    });

    it('skips with a reason when the order has no active reservation (no reserveUntil)', async () => {
        const builder = makeBuilder({
            order: makeOrder([
                { id: 'line-1', quantity: 1, productVariant: { productId: 'variant-1' } },
            ]),
            reservations: [],
            warehouseErpIdByLocationId: {},
            productExternalIds: { 'variant-1': 'product-1' },
            counterparty: { erpId: 'counterparty-1' },
            priceType: null,
        });

        expect(await build(builder)).toEqual({
            kind: 'skip',
            reason: 'order has no active reservation',
        });
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
