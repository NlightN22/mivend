import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IdempotencyKey } from '../../entities/idempotency-key.entity';
import { IdempotencyService } from '../../idempotency.service';

const mockRepo = {
    findOneOrFail: vi.fn(),
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

    // Key-exists branches need claim()'s real unique-constraint and conditional UPDATE behavior;
    // a mocked save() never throws, so these are covered in integration/idempotency.int.test.ts.

    it('executes fn once and stores the result on first call', async () => {
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

    it('marks the record failed and rethrows when fn throws', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('provider down'));

        await expect(
            service.withIdempotency(mockCtx, 'payment-service', 'payment:1:capture', 'hash', fn),
        ).rejects.toThrow('provider down');
        expect(mockRepo.save).toHaveBeenLastCalledWith(
            expect.objectContaining({ status: 'failed' }),
        );
    });
});
