import { describe, expect, it } from 'vitest';
import { ErpOrderService } from '@mivend/plugin-erp-order';

import { mockCtx, TestOrder, useReserveOrderHarness } from './reserve-order.harness';

const h = useReserveOrderHarness('erp_order_placed_stale_writer');

function erpOrderService(): ErpOrderService {
    return new ErpOrderService(
        h.connection,
        { publish: () => undefined } as never,
        { getPreferredForCustomer: async () => null } as never,
        { findOneByUserId: async () => null } as never,
        { getForCustomer: async () => null } as never,
        { record: async () => undefined } as never,
        { dictionary: async () => ({ codeWith: () => 'PENDING' }) } as never,
    );
}

// The placement subscriber of plugin-erp-order runs after commit on a stale event.order; it must not
// overwrite the reservation state another subscriber wrote meanwhile (#241).
describe('ErpOrderService.onOrderPlaced against a concurrent reservation-state write (real Postgres)', () => {
    it('keeps a state written after the event snapshot was taken, and still sets its own keys', async () => {
        const repo = h.dataSource.getRepository(TestOrder);
        const saved = await repo.save({
            customerId: null,
            customFields: { reservationState: 'NOT_REQUIRED' },
        });
        const stale = await repo.findOneOrFail({ where: { id: saved.id } });

        await repo.update(saved.id, {
            customFields: { reservationState: 'AWAITING_CONFIRMATION' },
        });
        await erpOrderService().onOrderPlaced(mockCtx, stale as never);

        const after = await repo.findOneOrFail({ where: { id: saved.id } });
        expect(after.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
        expect(after.customFields.erpStatus).toBe('PENDING');
    });

    it('survives the two writers racing, in either order', async () => {
        const repo = h.dataSource.getRepository(TestOrder);
        for (let i = 0; i < 10; i++) {
            const saved = await repo.save({
                customerId: null,
                customFields: { reservationState: 'NOT_REQUIRED' },
            });
            const stale = await repo.findOneOrFail({ where: { id: saved.id } });
            await Promise.all([
                erpOrderService().onOrderPlaced(mockCtx, stale as never),
                repo.update(saved.id, {
                    customFields: { reservationState: 'AWAITING_CONFIRMATION' },
                }),
            ]);
            const after = await repo.findOneOrFail({ where: { id: saved.id } });
            expect(after.customFields.reservationState).toBe('AWAITING_CONFIRMATION');
        }
    });
});
