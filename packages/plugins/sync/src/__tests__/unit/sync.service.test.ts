import { randomUUID } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SyncService } from '../../sync.service';
import { MAX_RETRY_DEFAULT } from '../../types';
import type { SyncPluginOptions } from '../../types';

const mockOutboxRepo = {
    create: vi.fn((v: unknown) => v),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
    update: vi.fn(),
    findOne: vi.fn(),
};

const mockEm = {
    getRepository: vi.fn(() => mockOutboxRepo),
};

const mockDataSource = {
    getRepository: vi.fn(() => mockOutboxRepo),
    transaction: vi.fn((cb: (em: typeof mockEm) => Promise<void>) => cb(mockEm)),
};

const publishMock = vi.fn().mockResolvedValue(undefined);
const mockRabbitMQ = { publish: publishMock } as never;

const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), dlq: vi.fn() };

const options: SyncPluginOptions = {
    instanceType: 'central',
    instanceId: 'hub',
    redis: { host: 'localhost', port: 6379 },
    rabbitmq: { url: 'amqp://localhost' },
    maxRetry: MAX_RETRY_DEFAULT,
};

describe('SyncService', () => {
    let service: SyncService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new SyncService(
            mockDataSource as never,
            mockRabbitMQ as never,
            options,
            mockLogger as never,
        );
    });

    describe('writeToOutbox', () => {
        it('saves entry with provided eventId', async () => {
            const eventId = randomUUID();
            await service.writeToOutbox(
                mockEm as never,
                { eventId, eventType: 'product.updated', payload: { productId: 'p-1' } } as never,
                'all-branches',
            );
            expect(mockOutboxRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    eventId,
                    eventType: 'product.updated',
                    status: 'pending',
                }),
            );
        });

        it('generates eventId when not provided', async () => {
            await service.writeToOutbox(
                mockEm as never,
                { eventType: 'product.updated', payload: { productId: 'p-1' } } as never,
                'all-branches',
            );
            const saved = mockOutboxRepo.save.mock.calls[0][0] as { eventId: string };
            expect(saved.eventId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
            );
        });
    });

    describe('processOutbox', () => {
        it('publishes pending entries and marks them delivered', async () => {
            const entry = {
                id: 1,
                eventId: randomUUID(),
                eventType: 'product.updated',
                payload: { productId: 'p-1' },
                target: 'all-branches',
                createdAt: new Date(),
                retryCount: 0,
            };
            const mockQb = {
                where: vi.fn().mockReturnThis(),
                andWhere: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                setLock: vi.fn().mockReturnThis(),
                setOnLocked: vi.fn().mockReturnThis(),
                getMany: vi.fn().mockResolvedValue([entry]),
            };
            mockOutboxRepo.createQueryBuilder.mockReturnValue(mockQb);

            await service.processOutbox();

            expect(publishMock).toHaveBeenCalledWith(
                'product.updated.all-branches',
                expect.objectContaining({ eventId: entry.eventId }),
            );
            expect(mockOutboxRepo.update).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ deliveredAt: expect.any(Date), status: 'delivered' }),
            );
        });

        it('records error and increments retryCount on publish failure', async () => {
            const entry = {
                id: 2,
                eventId: randomUUID(),
                eventType: 'product.updated',
                payload: { productId: 'p-2' },
                target: 'all-branches',
                createdAt: new Date(),
                retryCount: 0,
            };
            const mockQb = {
                where: vi.fn().mockReturnThis(),
                andWhere: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                setLock: vi.fn().mockReturnThis(),
                setOnLocked: vi.fn().mockReturnThis(),
                getMany: vi.fn().mockResolvedValue([entry]),
            };
            mockOutboxRepo.createQueryBuilder.mockReturnValue(mockQb);
            publishMock.mockRejectedValueOnce(new Error('Connection refused'));

            await service.processOutbox();

            expect(mockOutboxRepo.update).toHaveBeenCalledWith(
                2,
                expect.objectContaining({
                    retryCount: 1,
                    lastError: expect.stringContaining('Connection refused'),
                }),
            );
            expect(mockLogger.dlq).not.toHaveBeenCalled();
        });

        it('marks entry as failed and calls dlq after maxRetry exhausted', async () => {
            const entry = {
                id: 3,
                eventId: randomUUID(),
                eventType: 'product.updated',
                payload: { productId: 'p-3' },
                target: 'all-branches',
                createdAt: new Date(),
                retryCount: MAX_RETRY_DEFAULT - 1,
            };
            const mockQb = {
                where: vi.fn().mockReturnThis(),
                andWhere: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockReturnThis(),
                limit: vi.fn().mockReturnThis(),
                setLock: vi.fn().mockReturnThis(),
                setOnLocked: vi.fn().mockReturnThis(),
                getMany: vi.fn().mockResolvedValue([entry]),
            };
            mockOutboxRepo.createQueryBuilder.mockReturnValue(mockQb);
            publishMock.mockRejectedValueOnce(new Error('AMQP error'));

            await service.processOutbox();

            expect(mockOutboxRepo.update).toHaveBeenCalledWith(
                3,
                expect.objectContaining({ status: 'failed', retryCount: MAX_RETRY_DEFAULT }),
            );
            expect(mockLogger.dlq).toHaveBeenCalledWith(
                entry.eventId,
                expect.stringContaining('AMQP error'),
            );
        });
    });
});
