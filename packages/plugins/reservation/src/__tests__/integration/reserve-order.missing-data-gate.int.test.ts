import { describe, expect, it } from 'vitest';
import type { EventBus } from '@vendure/core';

import { ErpExportDataMissingError } from '../../reservation-errors';
import { ReservationService } from '../../reservation.service';
import {
    mockCtx,
    TestOrder,
    TestOrderLine,
    TestReservation,
    TestStockLevel,
    useReserveOrderHarness,
} from './reserve-order.harness';

const h = useReserveOrderHarness('reserve_order_missing_data_gate');

// A hold only queues the automatic reserve; the missing-data gate refuses the manual confirmation (#241).
function serviceWith(held: boolean): ReservationService {
    return new ReservationService(
        h.connection,
        { publish: () => undefined } as unknown as EventBus,
        { findBranchStockLocationIds: async () => [String(h.location.id)] } as never,
        { getForCustomer: async () => ({ erpId: 'counterparty-x' }) } as never,
        { resolveOrderContract: async () => null } as never,
        { requiredMultiple: async () => 1 } as never,
        {
            isHeld: async (_c: unknown, _id: string, trigger: string) =>
                held && trigger !== 'manual',
        } as never,
    );
}

async function seedOrderWithoutContract(): Promise<string> {
    await h.dataSource.getRepository(TestStockLevel).save({
        productVariantId: 'variant-1',
        stockLocationId: h.location.id,
        stockOnHand: 5,
        stockAllocated: 0,
    });
    const order = await h.dataSource
        .getRepository(TestOrder)
        .save({ customerId: 'customer-1', customFields: { branchId: 'branch-1' } });
    await h.dataSource.getRepository(TestOrderLine).save({
        orderId: order.id,
        productVariantId: 'variant-1',
        productVariantEntityId: h.productVariant.id,
        quantity: 2,
    });
    return String(order.id);
}

const reservations = (orderId: string): Promise<TestReservation[]> =>
    h.dataSource.getRepository(TestReservation).find({ where: { orderId } });

describe('order without a usable contract (integration, real Postgres)', () => {
    it('an automatic reserve is held in the queue and reserves nothing', async () => {
        const orderId = await seedOrderWithoutContract();

        const result = await serviceWith(true).reserveOrder(mockCtx, orderId, 3, 'auto-trust-rule');

        expect(result).toEqual([]);
        expect(await reservations(orderId)).toEqual([]);
    });

    it('the manual confirmation is refused with ErpExportDataMissingError: a hold is no bypass of the gate', async () => {
        const orderId = await seedOrderWithoutContract();

        const error = await serviceWith(true)
            .reserveOrder(mockCtx, orderId, 3, 'manual')
            .catch((e: unknown) => e as ErpExportDataMissingError);

        expect(error).toBeInstanceOf(ErpExportDataMissingError);
        expect((error as ErpExportDataMissingError).missingContract).toBe(true);
        expect(await reservations(orderId)).toEqual([]);
    });
});
