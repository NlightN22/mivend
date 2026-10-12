import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProformaInvoice } from '../../entities/proforma-invoice.entity';
import { ProformaInvoiceService } from '../../proforma-invoice.service';

const mockRepo = {
    find: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockCtx = {} as unknown as RequestContext;

describe('ProformaInvoiceService.findByOrderId', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns proforma invoices scoped to the given order', async () => {
        const proformaInvoices = [
            { id: 1, orderId: 5 } as ProformaInvoice,
            { id: 2, orderId: 5 } as ProformaInvoice,
        ];
        mockRepo.find.mockResolvedValue(proformaInvoices);
        const service = new ProformaInvoiceService(
            mockConnection,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
        );

        const result = await service.findByOrderId(mockCtx, 5);

        expect(mockRepo.find).toHaveBeenCalledWith({ where: { orderId: 5 } });
        expect(result).toBe(proformaInvoices);
    });
});
