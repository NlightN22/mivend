import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';

import { ReservationExtensionService } from '../../reservation-extension.service';
import type { ReservationExtensionLimitService } from '../../reservation-extension-limit.service';

describe('ReservationExtensionService', () => {
    let reservationRepo: { find: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    let connection: { getRepository: ReturnType<typeof vi.fn> };
    let extensionLimitService: { getLimit: ReturnType<typeof vi.fn> };
    let administratorService: { findOneByUserId: ReturnType<typeof vi.fn> };
    let service: ReservationExtensionService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    beforeEach(() => {
        reservationRepo = { find: vi.fn(async () => []), save: vi.fn(async (x: unknown) => x) };
        connection = { getRepository: vi.fn(() => reservationRepo) };
        extensionLimitService = {
            getLimit: vi.fn(async () => ({ roleCode: 'manager', maxExtraDays: 3 })),
        };
        administratorService = {
            findOneByUserId: vi.fn(async () => ({ user: { roles: [{ code: 'manager' }] } })),
        };
        service = new ReservationExtensionService(
            connection as unknown as TransactionalConnection,
            administratorService as unknown as AdministratorService,
            extensionLimitService as unknown as ReservationExtensionLimitService,
        );
    });

    it('extends expiry on active reservations within the role limit', async () => {
        const activeRow = { expiresAt: new Date('2026-01-01T00:00:00.000Z') };
        reservationRepo.find.mockResolvedValue([activeRow]);

        await service.extendReservation(ctx, 'order-1', 2);

        expect(activeRow.expiresAt).toEqual(new Date('2026-01-03T00:00:00.000Z'));
        expect(reservationRepo.save).toHaveBeenCalledWith([activeRow]);
    });

    it('rejects an extension beyond the role limit', async () => {
        reservationRepo.find.mockResolvedValue([{ expiresAt: new Date() }]);
        await expect(service.extendReservation(ctx, 'order-1', 10)).rejects.toThrow();
    });

    it('rejects when the role has no configured limit', async () => {
        extensionLimitService.getLimit.mockResolvedValue(null);
        await expect(service.extendReservation(ctx, 'order-1', 1)).rejects.toThrow();
    });

    it('rejects when there is no active reservation to extend', async () => {
        reservationRepo.find.mockResolvedValue([]);
        await expect(service.extendReservation(ctx, 'order-1', 1)).rejects.toThrow();
    });
});
