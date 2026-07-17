import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Invoice } from '../../entities/invoice.entity';
import { InvoiceService } from '../../invoice.service';

const mockRepo = {
    find: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockCtx = {} as unknown as RequestContext;

describe('InvoiceService.findByOrderId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns invoices scoped to the given order', async () => {
        const invoices = [{ id: 1, orderId: 5 } as Invoice, { id: 2, orderId: 5 } as Invoice];
        mockRepo.find.mockResolvedValue(invoices);
        const service = new InvoiceService(
            mockConnection,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );

        const result = await service.findByOrderId(mockCtx, 5);

        expect(mockRepo.find).toHaveBeenCalledWith({ where: { orderId: 5 } });
        expect(result).toBe(invoices);
    });
});
