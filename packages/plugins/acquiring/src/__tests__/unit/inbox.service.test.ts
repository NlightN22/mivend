import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProcessedProviderEvent } from '../../entities/processed-provider-event.entity';
import { InboxService } from '../../inbox.service';

const mockRepo = {
    create: vi.fn(
        (input: Partial<ProcessedProviderEvent>) => ({ ...input }) as ProcessedProviderEvent,
    ),
    save: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockCtx = {} as unknown as RequestContext;

describe('InboxService', () => {
    let service: InboxService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new InboxService(mockConnection);
    });

    it('returns true and records a new provider event', async () => {
        mockRepo.save.mockResolvedValue(undefined);

        const result = await service.recordIfNew(mockCtx, 'stub-provider', 'evt-1', 'hash');

        expect(result).toBe(true);
        expect(mockRepo.save).toHaveBeenCalledTimes(1);
    });

    it('returns false on a duplicate providerEventId (unique violation)', async () => {
        mockRepo.save.mockRejectedValue({ code: '23505' });

        const result = await service.recordIfNew(mockCtx, 'stub-provider', 'evt-1', 'hash');

        expect(result).toBe(false);
    });

    it('rethrows unrelated errors', async () => {
        mockRepo.save.mockRejectedValue(new Error('connection lost'));

        await expect(
            service.recordIfNew(mockCtx, 'stub-provider', 'evt-1', 'hash'),
        ).rejects.toThrow('connection lost');
    });
});
