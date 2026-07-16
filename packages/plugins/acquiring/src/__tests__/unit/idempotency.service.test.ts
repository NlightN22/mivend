import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdempotencyKey } from '../../entities/idempotency-key.entity';
import { IdempotencyService } from '../../idempotency.service';
import { IdempotencyConflictError } from '../../types';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn((input: Partial<IdempotencyKey>) => ({ ...input }) as IdempotencyKey),
    save: vi.fn(async (entity: IdempotencyKey) => entity),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockCtx = {} as unknown as RequestContext;

describe('IdempotencyService', () => {
    let service: IdempotencyService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new IdempotencyService(mockConnection);
    });

    it('executes fn once and stores the result on first call', async () => {
        mockRepo.findOne.mockResolvedValue(null);
        const fn = vi.fn().mockResolvedValue({ ok: true });

        const result = await service.withIdempotency(
            mockCtx,
            'payment-service',
            'payment:1:capture',
            'hash',
            fn,
        );

        expect(fn).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ ok: true });
        expect(mockRepo.save).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'completed',
                response: JSON.stringify({ ok: true }),
            }),
        );
    });

    it('returns the stored response without re-executing fn on a completed retry', async () => {
        mockRepo.findOne.mockResolvedValue({
            callerId: 'payment-service',
            idempotencyKey: 'payment:1:capture',
            requestHash: 'hash',
            status: 'completed',
            response: JSON.stringify({ ok: true }),
        } as IdempotencyKey);
        const fn = vi.fn().mockResolvedValue({ ok: false });

        const result = await service.withIdempotency(
            mockCtx,
            'payment-service',
            'payment:1:capture',
            'hash',
            fn,
        );

        expect(fn).not.toHaveBeenCalled();
        expect(result).toEqual({ ok: true });
    });

    it('throws a payload-mismatch conflict when the same key carries a different hash', async () => {
        mockRepo.findOne.mockResolvedValue({
            callerId: 'payment-service',
            idempotencyKey: 'payment:1:capture',
            requestHash: 'old-hash',
            status: 'completed',
            response: '{}',
        } as IdempotencyKey);
        const fn = vi.fn();

        await expect(
            service.withIdempotency(
                mockCtx,
                'payment-service',
                'payment:1:capture',
                'new-hash',
                fn,
            ),
        ).rejects.toThrow(IdempotencyConflictError);
        expect(fn).not.toHaveBeenCalled();
    });

    it('throws an in-progress conflict for a concurrent duplicate with the same hash', async () => {
        mockRepo.findOne.mockResolvedValue({
            callerId: 'payment-service',
            idempotencyKey: 'payment:1:capture',
            requestHash: 'hash',
            status: 'inProgress',
            response: null,
        } as IdempotencyKey);
        const fn = vi.fn();

        await expect(
            service.withIdempotency(mockCtx, 'payment-service', 'payment:1:capture', 'hash', fn),
        ).rejects.toThrow(IdempotencyConflictError);
        expect(fn).not.toHaveBeenCalled();
    });

    it('marks the record failed and rethrows when fn throws', async () => {
        mockRepo.findOne.mockResolvedValue(null);
        const fn = vi.fn().mockRejectedValue(new Error('provider down'));

        await expect(
            service.withIdempotency(mockCtx, 'payment-service', 'payment:1:capture', 'hash', fn),
        ).rejects.toThrow('provider down');
        expect(mockRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'failed' }),
        );
    });

    it('allows a fresh attempt after a previously failed record with the same hash', async () => {
        mockRepo.findOne.mockResolvedValue({
            callerId: 'payment-service',
            idempotencyKey: 'payment:1:capture',
            requestHash: 'hash',
            status: 'failed',
            response: null,
        } as IdempotencyKey);
        const fn = vi.fn().mockResolvedValue({ ok: true });

        const result = await service.withIdempotency(
            mockCtx,
            'payment-service',
            'payment:1:capture',
            'hash',
            fn,
        );

        expect(fn).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ ok: true });
    });
});
