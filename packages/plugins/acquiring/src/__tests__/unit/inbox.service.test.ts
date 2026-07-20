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

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
    function createMockRepo() {
        return {
            findOne: vi.fn(),
            findOneOrFail: vi.fn(),
            create: vi.fn(input => input),
            save: vi.fn(async entity => entity),
            update: vi.fn(),
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
                invoiceId: 7,
            });

            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: 'bank-transfer-erp',
                    providerEventId: 'evt-1',
                    status: 'pending',
                    attempts: 0,
                    payload: JSON.stringify({ invoiceId: 7 }),
                }),
            );
            expect(result.status).toBe('pending');
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

    // claimBatch itself (oldest-first ordering, marking 'processing', the atomic
    // SELECT...FOR UPDATE SKIP LOCKED claim, and stuck-'processing' recovery) is deliberately
    // NOT unit-tested here — it runs a real transaction/row-lock against rawConnection, and a
    // mocked query builder would only prove the mock was called, not that the locking actually
    // prevents a double-claim (see docs/testing-strategy.md: "a unit test does not prove
    // ORM/SQL/transaction/locking behavior"). Covered for real in
    // integration/payment-inbox-claim.int.test.ts.

    describe('markProcessed / markFailed', () => {
        it('markProcessed sets status "processed" with a processedAt timestamp', async () => {
            await service.markProcessed(mockCtx, 1);

            expect(mockRepo.update).toHaveBeenCalledWith(
                { id: 1 },
                expect.objectContaining({ status: 'processed' }),
            );
        });

        it('markFailed increments attempts and returns to "pending" while under the retry limit', async () => {
            mockRepo.findOneOrFail.mockResolvedValue(makeEvent({ attempts: 1 }));

            await service.markFailed(mockCtx, 1, new Error('boom'));

            expect(mockRepo.update).toHaveBeenCalledWith(
                { id: 1 },
                { attempts: 2, lastError: 'boom', status: 'pending' },
            );
        });

        it('markFailed dead-letters the event ("failed", terminal) once MAX_ATTEMPTS is reached', async () => {
            mockRepo.findOneOrFail.mockResolvedValue(makeEvent({ attempts: 4 }));

            await service.markFailed(mockCtx, 1, new Error('still broken'));

            expect(mockRepo.update).toHaveBeenCalledWith(
                { id: 1 },
                { attempts: 5, lastError: 'still broken', status: 'failed' },
            );
        });
    });

    describe('rejectAsInvalid', () => {
        it('dead-letters immediately, at max attempts, without going through the retry path', async () => {
            await service.rejectAsInvalid(mockCtx, 1, 'missing mandatory external reference');

            expect(mockRepo.update).toHaveBeenCalledWith(
                { id: 1 },
                {
                    status: 'failed',
                    attempts: 5,
                    lastError: 'missing mandatory external reference',
                },
            );
        });
    });
});
