import { randomUUID } from 'crypto';
import { describe, expect, it, vi } from 'vitest';

import { TestReservation, mockCtx, useReserveOrderHarness } from './reserve-order.harness';
import { buildCancellationFixture, seedCancellableOrder } from './order-cancellation.harness';

const h = useReserveOrderHarness('reserve_handover');

function changed(orderUuid: string, reservedQuantity: number, warehouseStarted = false) {
    return {
        orderUuid,
        orderEntityId: 'erp-order-1',
        status: '',
        reservedLines: [{ productVariantId: 'variant-1', reservedQuantity }],
        contractId: null,
        derivedStatus: (warehouseStarted ? 'PICKING' : 'APPROVED') as never,
    };
}

async function build(): Promise<ReturnType<typeof buildCancellationFixture>> {
    const f = buildCancellationFixture(h);
    const reconciliation = { reportQuantityMismatch: vi.fn(async () => undefined) };
    (f.writeOff as unknown as { reconciliationIssueService: unknown }).reconciliationIssueService =
        reconciliation;
    return f;
}

async function rows(orderId: string): Promise<TestReservation[]> {
    return h.dataSource.getRepository(TestReservation).find({ where: { orderId } });
}

const sum = (list: TestReservation[], status: string): number =>
    list.filter(r => r.status === status).reduce((acc, r) => acc + r.quantity, 0);

// ERP quantity is compared with active + handed-over rows under reserve-order:<id> (#236).
describe('releasing the local reserve against the ERP quantity (real Postgres)', () => {
    it('partial quantity splits the row: covered part handed over, remainder stays active', async () => {
        const f = await build();
        const order = await seedCancellableOrder(h);

        await f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 1));

        const list = await rows(order.id);
        expect(sum(list, 'active')).toBe(1);
        expect(sum(list, 'released')).toBe(1);
        expect(list.filter(r => r.status === 'released').every(r => r.erpHandedOverAt)).toBe(true);
    });

    it('zero keeps the reserve active; zero with a warehouse order releases it', async () => {
        const f = await build();
        const kept = await seedCancellableOrder(h);
        await f.writeOff.handleOrderChanged(mockCtx, changed(kept.uuid, 0));
        expect(sum(await rows(kept.id), 'active')).toBe(2);

        const closed = await seedCancellableOrder(h);
        await f.writeOff.handleOrderChanged(mockCtx, changed(closed.uuid, 0, true));
        expect(sum(await rows(closed.id), 'active')).toBe(0);
    });

    it('a repeated partial event and a later full quantity are idempotent', async () => {
        const f = await build();
        const order = await seedCancellableOrder(h);

        await f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 1));
        await f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 1));
        expect(sum(await rows(order.id), 'active')).toBe(1);

        await f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 2));
        const list = await rows(order.id);
        expect(sum(list, 'active')).toBe(0);
        expect(sum(list, 'released')).toBe(2);
    });

    it('two concurrent identical events release the quantity once', async () => {
        const f = await build();
        const order = await seedCancellableOrder(h);

        await Promise.all([
            f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 1)),
            f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 1)),
            f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 1)),
        ]);

        const list = await rows(order.id);
        expect(sum(list, 'active')).toBe(1);
        expect(sum(list, 'released')).toBe(1);
    });

    it('a row released earlier by cancel/expiry does not count as handed over', async () => {
        const f = await build();
        const order = await seedCancellableOrder(h);
        await h.dataSource.getRepository(TestReservation).save({
            orderId: order.id,
            orderLineId: randomUUID(),
            productVariantId: 'variant-1',
            stockLocationId: h.location.id,
            quantity: 3,
            status: 'released',
            reservedAt: new Date(),
            expiresAt: new Date(),
            releasedAt: new Date(),
            creationMethod: 'manual',
            erpOperationId: randomUUID(),
            erpReleaseOperationId: randomUUID(),
        });

        await f.writeOff.handleOrderChanged(mockCtx, changed(order.uuid, 2));

        expect(sum(await rows(order.id), 'active')).toBe(0);
    });
});
