import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DisputeService } from '../../dispute.service';

const mockCtx = {} as unknown as RequestContext;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
function createMockRepo() {
    return {
        find: vi.fn(),
        create: vi.fn(input => input),
        save: vi.fn(async entity => ({ id: 1, ...entity })),
    };
}

describe('DisputeService', () => {
    let service: DisputeService;
    let mockRepo: ReturnType<typeof createMockRepo>;
    let mockConnection: TransactionalConnection;

    beforeEach(() => {
        mockRepo = createMockRepo();
        mockConnection = {
            getRepository: vi.fn(() => mockRepo),
        } as unknown as TransactionalConnection;
        service = new DisputeService(mockConnection);
    });

    it('creates a dispute defaulting to opened status', async () => {
        const dispute = await service.create(mockCtx, {
            paymentId: 42,
            type: 'chargeback',
            amount: 5000,
        });
        expect(mockRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentId: 42,
                type: 'chargeback',
                amount: 5000,
                status: 'opened',
            }),
        );
        expect(dispute.status).toBe('opened');
    });

    it('respects an explicit non-default status (e.g. a resolved dispute)', async () => {
        await service.create(mockCtx, {
            paymentId: 42,
            type: 'dispute',
            amount: 1000,
            status: 'won',
        });
        expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ status: 'won' }));
    });

    it('finds disputes for a payment ordered newest first', async () => {
        mockRepo.find.mockResolvedValue([]);
        await service.findByPaymentId(mockCtx, 42);
        expect(mockRepo.find).toHaveBeenCalledWith({
            where: { paymentId: 42 },
            order: { openedAt: 'DESC' },
        });
    });
});
