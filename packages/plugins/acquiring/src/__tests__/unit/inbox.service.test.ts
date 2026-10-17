import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IncomingPaymentEvent } from '../../entities/incoming-payment-event.entity';
import { InboxService } from '../../inbox.service';

const mockCtx = {} as unknown as RequestContext;

function makeEvent(overrides: Partial<IncomingPaymentEvent> = {}): IncomingPaymentEvent {
    return {
        id: 1,
        provider: 'bank-transfer-erp',
        providerEventId: 'evt-1',
        payloadHash: 'hash',
        payload: '{}',
        status: 'pending',
        attempts: 0,
        lastError: null,
        processedAt: null,
        ...overrides,
    } as IncomingPaymentEvent;
}

describe('InboxService', () => {
    let service: InboxService;
    let mockRepo: ReturnType<typeof createMockRepo>;
    let mockConnection: TransactionalConnection;

    const qb = {} as Record<'update' | 'set' | 'where' | 'execute', ReturnType<typeof vi.fn>>;
    Object.assign(qb, {
        update: vi.fn(() => qb),
        set: vi.fn(() => qb),
        where: vi.fn(() => qb),
        execute: vi.fn(async () => ({ affected: 1 })),
    });

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockRepo() {
        return {
            findOne: vi.fn(),
            findOneOrFail: vi.fn(),
            create: vi.fn(input => input),
            save: vi.fn(async entity => entity),
            update: vi.fn(),
            createQueryBuilder: vi.fn(() => qb),
        };
    }

    beforeEach(() => {
        mockRepo = createMockRepo();
        mockConnection = {
            getRepository: vi.fn(() => mockRepo),
        } as unknown as TransactionalConnection;
        service = new InboxService(mockConnection);
    });

    describe('enqueue', () => {
        it('records a new event as "pending" when this (provider, providerEventId) is unseen', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            const result = await service.enqueue(mockCtx, 'bank-transfer-erp', 'evt-1', 'hash', {
                proformaInvoiceId: 7,
            });

            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'bank-transfer-erp',
                    providerEventId: 'evt-1',
                    status: 'pending',
                    attempts: 0,
                    payload: JSON.stringify({ proformaInvoiceId: 7 }),
                }),
            );
            expect(result.status).toBe('pending');
        });

        it('with a rejectReason records the row terminal in the same write (no pending window)', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            await service.enqueue(mockCtx, 'branch-kassa', 'evt-9', 'hash', {}, 'no reference');

            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                    attempts: 5,
                    lastError: 'no reference',
                }),
            );
        });

        it('returns the existing row instead of creating a duplicate when already enqueued', async () => {
            const existing = makeEvent();
            mockRepo.findOne.mockResolvedValue(existing);

            const result = await service.enqueue(mockCtx, 'bank-transfer-erp', 'evt-1', 'hash', {});

            expect(mockRepo.save).not.toHaveBeenCalled();
            expect(result).toBe(existing);
        });

        it('falls back to the existing row on a UNIQUE-constraint race (two concurrent enqueues of the same event)', async () => {
            mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(makeEvent());
            mockRepo.save.mockRejectedValueOnce({ code: '23505' });

            const result = await service.enqueue(mockCtx, 'bank-transfer-erp', 'evt-1', 'hash', {});

            expect(result.providerEventId).toBe('evt-1');
        });

        it('rethrows unrelated errors', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.save.mockRejectedValue(new Error('connection lost'));

            await expect(
                service.enqueue(mockCtx, 'bank-transfer-erp', 'evt-1', 'hash', {}),
            ).rejects.toThrow('connection lost');
        });
    });

    // Not unit-tested: a mock can't prove the row-locking claim prevents double-claims.
    // Covered by integration/payment-inbox-claim.int.test.ts against a real transaction.

    describe('markProcessed / markFailed', () => {
        it('markProcessed settles only a row still in "processing"', async () => {
            await service.markProcessed(mockCtx, 1);

            expect(mockRepo.update).toHaveBeenCalledWith(
                { id: 1, status: 'processing' },
                expect.objectContaining({ status: 'processed' }),
            );
        });

        it('markFailed is one conditional UPDATE that increments attempts in SQL', async () => {
            await service.markFailed(mockCtx, 1, new Error('boom'));

            const set = qb.set.mock.calls[0] as unknown as [
                { attempts: () => string; status: () => string; lastError: string },
            ];
            expect(set[0].attempts()).toBe('attempts + 1');
            expect(set[0].status()).toContain("CASE WHEN attempts + 1 >= 5 THEN 'failed'");
            expect(set[0].lastError).toBe('boom');
            expect(qb.where).toHaveBeenCalledWith(expect.stringContaining('status = :processing'), {
                id: 1,
                processing: 'processing',
            });
        });
    });

    describe('rejectAsInvalid', () => {
        it('dead-letters immediately, at max attempts, without going through the retry path', async () => {
            await service.rejectAsInvalid(mockCtx, 1, 'missing mandatory external reference');

            expect(mockRepo.update).toHaveBeenCalledWith(
                { id: 1, status: 'processing' },
                {
                    status: 'failed',
                    attempts: 5,
                    lastError: 'missing mandatory external reference',
                },
            );
        });
    });
});
