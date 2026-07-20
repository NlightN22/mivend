import { describe, it, expect, vi } from 'vitest';
import type { DataSource } from 'typeorm';

import { ReservationExpiryService } from '../../reservation-expiry.service';

describe('ReservationExpiryService.expireDueReservations', () => {
    function createService(
        dueRows: unknown[],
        orderRows: unknown[] = [],
    ): {
        service: ReservationExpiryService;
        txReservationRepo: { find: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
        txOrderRepo: { find: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    } {
        const txReservationRepo = {
            find: vi.fn(async () => dueRows),
            update: vi.fn(async () => ({ affected: dueRows.length })),
        };
        const txOrderRepo = {
            find: vi.fn(async () => orderRows),
            update: vi.fn(async (x: unknown) => x),
        };
        const manager = {
            getRepository: vi.fn((entity: { name?: string }) =>
                entity?.name === 'Order' ? txOrderRepo : txReservationRepo,
            ),
        };
        const dataSource = {
            transaction: vi.fn(async (work: (m: unknown) => unknown) => work(manager)),
        } as unknown as DataSource;
        return {
            service: new ReservationExpiryService(dataSource),
            txReservationRepo,
            txOrderRepo,
        };
    }

    it('expires past-due reservations and returns their orders to AWAITING_CONFIRMATION', async () => {
        const dueRows = [
            { id: 'res-1', orderId: 'order-1', creationMethod: 'manual' },
            { id: 'res-2', orderId: 'order-2', creationMethod: 'manual' },
        ];
        const { service, txReservationRepo, txOrderRepo } = createService(dueRows, [
            { id: 'order-1', customFields: { reservationState: 'RESERVED' } },
            { id: 'order-2', customFields: { reservationState: 'FAILED' } },
        ]);

        const count = await service.expireDueReservations();

        expect(count).toBe(2);
        expect(txReservationRepo.update).toHaveBeenCalled();
        expect(txOrderRepo.update).toHaveBeenCalledTimes(1);
        expect(txOrderRepo.update).toHaveBeenCalledWith('order-1', {
            customFields: { reservationState: 'AWAITING_CONFIRMATION' },
        });
    });

    it('is a no-op when nothing is due', async () => {
        const { service } = createService([]);
        const count = await service.expireDueReservations();
        expect(count).toBe(0);
    });

    it('never expires an auto-prepaid reservation — flags it for intervention instead', async () => {
        const dueRows = [
            {
                id: 'res-1',
                orderId: 'order-1',
                creationMethod: 'auto-prepaid',
                interventionFlaggedAt: null,
                expiresAt: new Date('2026-01-01'),
            },
        ];
        const { service, txReservationRepo, txOrderRepo } = createService(dueRows);

        const count = await service.expireDueReservations();

        expect(count).toBe(1);
        expect(txReservationRepo.update).toHaveBeenCalledWith(
            { id: expect.anything() },
            expect.objectContaining({ interventionFlaggedAt: expect.any(Date) }),
        );
        expect(txReservationRepo.update).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ status: 'expired' }),
        );
        expect(txOrderRepo.update).not.toHaveBeenCalled();
    });

    it('does not re-flag an auto-prepaid reservation already flagged', async () => {
        const dueRows = [
            {
                id: 'res-1',
                orderId: 'order-1',
                creationMethod: 'auto-prepaid',
                interventionFlaggedAt: new Date('2026-01-01'),
            },
        ];
        const { service, txReservationRepo } = createService(dueRows);

        const count = await service.expireDueReservations();

        expect(count).toBe(0);
        expect(txReservationRepo.update).not.toHaveBeenCalled();
    });
});
