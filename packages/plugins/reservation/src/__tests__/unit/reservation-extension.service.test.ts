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
    let qb: Record<
        'update' | 'set' | 'setParameter' | 'where' | 'returning' | 'execute',
        ReturnType<typeof vi.fn>
    >;
    let reservationRepo: { createQueryBuilder: ReturnType<typeof vi.fn> };
    let checks: { evaluate: ReturnType<typeof vi.fn> };
    let service: ReservationExtensionService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    beforeEach(() => {
        qb = {
            update: vi.fn(() => qb),
            set: vi.fn(() => qb),
            setParameter: vi.fn(() => qb),
            where: vi.fn(() => qb),
            returning: vi.fn(() => qb),
            execute: vi.fn(async () => ({ raw: [] })),
        };
        reservationRepo = { createQueryBuilder: vi.fn(() => qb) };
        checks = { evaluate: vi.fn(async () => ({ findings: [], strongestConsequence: null })) };
        service = new ReservationExtensionService(
            { getRepository: vi.fn(() => reservationRepo) } as unknown as TransactionalConnection,
            {
                getActorIdentity: async () => ({ roleCode: 'manager', branchId: 'b1' }),
            } as unknown as AccessScopeService,
            checks as unknown as ChecksService,
        );
    });

    it('extends expiry with one conditional UPDATE on active rows when the check finds nothing', async () => {
        qb.execute.mockResolvedValue({ raw: [{ id: 1, expiresAt: new Date() }] });

        const result = await service.extendReservation(ctx, 'order-1', 2);

        expect(checks.evaluate).toHaveBeenCalledWith(
            ctx,
            'manager',
            { roleCode: 'manager', branchId: 'b1', params: { additionalDays: 2 } },
            'extend-reservation',
        );
        expect(result).toHaveLength(1);
        expect(qb.setParameter).toHaveBeenCalledWith('days', 2);
        expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('status = :status'), {
            orderId: 'order-1',
            status: 'active',
        });
    });

    it('refuses and reads no reservation when the policy blocks', async () => {
        checks.evaluate.mockResolvedValue({ findings: [{}], strongestConsequence: 'block' });
        await expect(service.extendReservation(ctx, 'order-1', 10)).rejects.toBeInstanceOf(
            ForbiddenError,
        );
        expect(reservationRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('proceeds when the policy is loosened to warn', async () => {
        checks.evaluate.mockResolvedValue({ findings: [{}], strongestConsequence: 'warn' });
        qb.execute.mockResolvedValue({ raw: [{ id: 1, expiresAt: new Date() }] });
        await expect(service.extendReservation(ctx, 'order-1', 10)).resolves.toHaveLength(1);
    });

    it('rejects a non-positive or fractional day count before any check', async () => {
        await expect(service.extendReservation(ctx, 'order-1', 0)).rejects.toThrow();
        await expect(service.extendReservation(ctx, 'order-1', 1.5)).rejects.toThrow();
        expect(checks.evaluate).not.toHaveBeenCalled();
    });

    it('rejects when there is no active reservation to extend', async () => {
        await expect(service.extendReservation(ctx, 'order-1', 1)).rejects.toThrow();
    });
});
