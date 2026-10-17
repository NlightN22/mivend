import { beforeEach, describe, expect, it } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { OrderDeliveryEditService } from '../../order-delivery-edit.service';
import { OrderLineEditGuard } from '../../order-line-edit.guard';
import {
    mockCtx,
    TestOrder,
    TestOrderLine,
    TestReservation,
    TestStockLevel,
    useReserveOrderHarness,
} from './reserve-order.harness';
import {
    deliveryExtras,
    TestShippingLine,
    TestShippingMethod,
} from './order-delivery-edit.harness';

const h = useReserveOrderHarness('order_delivery_edit', deliveryExtras);

const point = { id: 9, name: 'North Depot', address: 'North Ave 42' };

function deliveryService(published: string[] = []): OrderDeliveryEditService {
    const qb = { alias: 'o', andWhere: () => qb, getOne: async () => ({}) };
    return new OrderDeliveryEditService(
        h.connection,
        { buildVisibleOrdersQuery: async () => qb } as never,
        new OrderLineEditGuard(
            { dictionary: async () => ({ get: () => null }) } as never,
            h.service,
            { get: () => ({ submissionState: async () => 'none' }) } as never,
        ),
        { createHistoryEntryForOrder: async () => undefined } as never,
        { findVisibleForCounterparty: async () => [point] } as never,
        { getForCustomer: async () => ({ id: 5 }) } as never,
        { publish: (e: object) => published.push(e.constructor.name) } as never,
        { run: async () => undefined } as never,
    );
}

async function placedOrderWithReservation() {
    const [freight, pickup] = await h.dataSource
        .getRepository(TestShippingMethod)
        .save([{ code: 'freight-delivery' }, { code: 'pickup' }]);
    await h.dataSource.getRepository(TestStockLevel).save({
        productVariantId: 'variant-d1',
        stockLocationId: h.location.id,
        stockOnHand: 100,
        stockAllocated: 0,
    });
    const order = await h.dataSource
        .getRepository(TestOrder)
        .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
    await h.dataSource.getRepository(TestOrderLine).save({
        orderId: order.id,
        productVariantId: 'variant-d1',
        productVariantEntityId: h.productVariant.id,
        quantity: 5,
    });
    const shippingLine = await h.dataSource
        .getRepository(TestShippingLine)
        .save({ orderId: order.id, shippingMethodId: pickup.id });
    await h.service.reserveOrder(mockCtx as RequestContext, order.id, 7, 'manual');
    return { order, shippingLine, freight, pickup };
}

const reservationStatuses = async (orderId: string): Promise<string[]> =>
    (await h.dataSource.getRepository(TestReservation).find({ where: { orderId } })).map(
        r => r.status,
    );

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE TABLE reservation_test_shipping_line, reservation_test_shipping_method CASCADE',
    );
});

describe('OrderDeliveryEditService (integration, real Postgres)', () => {
    it('setOrderDelivery releases the active reservation, switches the method and the point', async () => {
        const { order, shippingLine, freight } = await placedOrderWithReservation();
        expect(await reservationStatuses(order.id)).toEqual(['active']);
        const published: string[] = [];

        await deliveryService(published).setDelivery(mockCtx, order.id, 'COURIER', '9');

        expect(await reservationStatuses(order.id)).toEqual(['released']);
        const line = await h.dataSource
            .getRepository(TestShippingLine)
            .findOneByOrFail({ id: shippingLine.id });
        expect(line.shippingMethodId).toBe(freight.id);
        const stored = await h.dataSource
            .getRepository(TestOrder)
            .findOneByOrFail({ id: order.id });
        expect(stored.customFields.tradingPointId).toBe('9');
        expect(stored.customFields.deliveryAddress).toBe('North Ave 42');
        expect(published).toContain('OrderDeliveryEditedEvent');
    });

    it('switching to pickup also releases the reservation', async () => {
        const { order, shippingLine, pickup } = await placedOrderWithReservation();

        await deliveryService().setDelivery(mockCtx, order.id, 'PICKUP', null);

        expect(await reservationStatuses(order.id)).toEqual(['released']);
        const line = await h.dataSource
            .getRepository(TestShippingLine)
            .findOneByOrFail({ id: shippingLine.id });
        expect(line.shippingMethodId).toBe(pickup.id);
    });
});
