import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PaymentRefundService } from '../../payment-refund.service';

const mockCtx = {} as unknown as RequestContext;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- vitest's Mock<> generic return type is awkward to spell out exactly here
function createMockRepo() {
    return {
        find: vi.fn(),
        create: vi.fn(input => input),
        save: vi.fn(async entity => ({ id: 1, ...entity })),
    };
}

describe('PaymentRefundService', () => {
    let service: PaymentRefundService;
    let mockRepo: ReturnType<typeof createMockRepo>;
    let mockConnection: TransactionalConnection;

    beforeEach(() => {
        mockRepo = createMockRepo();
        mockConnection = {
            getRepository: vi.fn(() => mockRepo),
        } as unknown as TransactionalConnection;
        service = new PaymentRefundService(mockConnection);
    });

    it('creates a refund defaulting to succeeded status, modeled on Robokassa OpKey as providerRefundId', async () => {
        const refund = await service.create(mockCtx, {
            paymentId: 42,
            amount: 5000,
            reason: 'Customer requested refund',
            providerRefundId: '48213077',
        });

        expect(mockRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
                paymentId: 42,
                amount: 5000,
                status: 'succeeded',
                providerRefundId: '48213077',
            }),
        );
        expect(refund.status).toBe('succeeded');
    });

    it('respects an explicit non-default status (e.g. pending, awaiting acquirer confirmation)', async () => {
        await service.create(mockCtx, {
            paymentId: 42,
            amount: 1000,
            reason: 'partial',
            status: 'pending',
        });
        expect(mockRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'pending' }),
        );
    });

    it('finds refunds for a payment ordered newest first', async () => {
        mockRepo.find.mockResolvedValue([]);
        await service.findByPaymentId(mockCtx, 42);
        expect(mockRepo.find).toHaveBeenCalledWith({
            where: { paymentId: 42 },
            order: { createdAt: 'DESC' },
        });
    });
});
