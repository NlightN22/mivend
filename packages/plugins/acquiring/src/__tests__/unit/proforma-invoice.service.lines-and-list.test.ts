import { RequestContext, TransactionalConnection } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProformaInvoiceService } from '../../proforma-invoice.service';

const mockQb = {
    leftJoinAndSelect: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    take: vi.fn(),
    skip: vi.fn(),
    getOne: vi.fn(),
    getManyAndCount: vi.fn(),
};
mockQb.leftJoinAndSelect.mockReturnValue(mockQb);
mockQb.where.mockReturnValue(mockQb);
mockQb.andWhere.mockReturnValue(mockQb);
mockQb.orderBy.mockReturnValue(mockQb);
mockQb.addOrderBy.mockReturnValue(mockQb);
mockQb.take.mockReturnValue(mockQb);
mockQb.skip.mockReturnValue(mockQb);

const mockRepo = {
    createQueryBuilder: vi.fn(() => mockQb),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockCtx = {} as unknown as RequestContext;

describe('ProformaInvoiceService.findForCounterparty', () => {
    let service: ProformaInvoiceService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new ProformaInvoiceService(mockConnection);
    });

    it('paginates and scopes by counterpartyId', async () => {
        mockQb.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);

        const result = await service.findForCounterparty(mockCtx, '42', { take: 10, skip: 0 });

        expect(mockQb.where).toHaveBeenCalledWith(
            'proformaInvoice.counterpartyId = :counterpartyId',
            {
                counterpartyId: 42,
            },
        );
        expect(mockQb.take).toHaveBeenCalledWith(10);
        expect(mockQb.skip).toHaveBeenCalledWith(0);
        expect(result).toEqual({ items: [{ id: 1 }], totalItems: 1 });
    });

    it('applies the status filter when provided', async () => {
        mockQb.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findForCounterparty(mockCtx, '42', { status: 'issued' });

        expect(mockQb.andWhere).toHaveBeenCalledWith('proformaInvoice.status = :status', {
            status: 'issued',
        });
    });

    it('applies search as a substring match against the proforma invoice number', async () => {
        mockQb.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findForCounterparty(mockCtx, '42', { search: 'ORD-202607' });

        expect(mockQb.andWhere).toHaveBeenCalledWith('proformaInvoice.number ILIKE :search', {
            search: '%ORD-202607%',
        });
    });
});

describe('ProformaInvoiceService.findForCounterparty orderCode', () => {
    it('restricts the list to the proforma invoices of one order code', async () => {
        vi.clearAllMocks();
        mockQb.getManyAndCount.mockResolvedValue([[], 0]);
        const service = new ProformaInvoiceService(mockConnection);
        await service.findForCounterparty(mockCtx, '42', { orderCode: 'ORD-1' });
        expect(mockQb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('o.code = :orderCode'),
            {
                orderCode: 'ORD-1',
            },
        );
    });
});

describe('ProformaInvoiceService.updateStatusForOrder', () => {
    let service: ProformaInvoiceService;
    const mockUpdate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdate.mockReset();
        service = new ProformaInvoiceService({
            getRepository: vi.fn(() => ({ update: mockUpdate })),
        } as unknown as TransactionalConnection);
    });

    it('updates the status of the pending proforma invoices of the order', async () => {
        await service.updateStatusForOrder(mockCtx, 7, 'paid');

        expect(mockUpdate).toHaveBeenCalledWith(
            { orderId: 7, status: 'pending' },
            { status: 'paid' },
        );
    });
});
