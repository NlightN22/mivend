import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import type { ChecksService } from '@mivend/plugin-checks';

import { ReservationExtensionService } from '../../reservation-extension.service';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<object>()),
    withAggregateLock: vi.fn(
        async (_c: unknown, ctx: unknown, _k: string, fn: (c: unknown) => unknown) => fn(ctx),
    ),
}));

describe('ReservationExtensionService', () => {
    let reservationRepo: { find: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn> };
    let checks: { evaluate: ReturnType<typeof vi.fn> };
    let service: ReservationExtensionService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    beforeEach(() => {
        reservationRepo = { find: vi.fn(async () => []), save: vi.fn(async (x: unknown) => x) };
        checks = { evaluate: vi.fn(async () => ({ findings: [], strongestConsequence: null })) };
        service = new ReservationExtensionService(
            { getRepository: vi.fn(() => reservationRepo) } as unknown as TransactionalConnection,
            {
                getActorIdentity: async () => ({ roleCode: 'manager', branchId: 'b1' }),
            } as unknown as AccessScopeService,
            checks as unknown as ChecksService,
        );
    });

    it('extends expiry on active reservations when the check finds nothing', async () => {
        const activeRow = { expiresAt: new Date('2026-01-01T00:00:00.000Z') };
        reservationRepo.find.mockResolvedValue([activeRow]);

        await service.extendReservation(ctx, 'order-1', 2);

        expect(checks.evaluate).toHaveBeenCalledWith(
            ctx,
            'manager',
            { roleCode: 'manager', branchId: 'b1', params: { additionalDays: 2 } },
            'extend-reservation',
        );
        expect(activeRow.expiresAt).toEqual(new Date('2026-01-03T00:00:00.000Z'));
        expect(reservationRepo.save).toHaveBeenCalledWith([activeRow]);
    });

    it('refuses and reads no reservation when the policy blocks', async () => {
        checks.evaluate.mockResolvedValue({ findings: [{}], strongestConsequence: 'block' });
        await expect(service.extendReservation(ctx, 'order-1', 10)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(reservationRepo.find).not.toHaveBeenCalled();
    });

    it('proceeds when the policy is loosened to warn', async () => {
        checks.evaluate.mockResolvedValue({ findings: [{}], strongestConsequence: 'warn' });
        reservationRepo.find.mockResolvedValue([{ expiresAt: new Date() }]);
        await expect(service.extendReservation(ctx, 'order-1', 10)).resolves.toHaveLength(1);
    });

    it('rejects a non-positive or fractional day count before any check', async () => {
        await expect(service.extendReservation(ctx, 'order-1', 0)).rejects.toThrow();
        await expect(service.extendReservation(ctx, 'order-1', 1.5)).rejects.toThrow();
        expect(checks.evaluate).not.toHaveBeenCalled();
    });

    it('rejects when there is no active reservation to extend', async () => {
        reservationRepo.find.mockResolvedValue([]);
        await expect(service.extendReservation(ctx, 'order-1', 1)).rejects.toThrow();
    });
});
