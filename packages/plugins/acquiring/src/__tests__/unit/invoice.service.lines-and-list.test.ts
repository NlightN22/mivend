import { EntityHydrator, Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyService } from '@mivend/plugin-counterparty';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Invoice } from '../../entities/invoice.entity';
import { InvoiceService } from '../../invoice.service';

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

const mockTranslator = { translate: vi.fn(entity => entity) };

describe('InvoiceService.getLinesForInvoice', () => {
    let service: InvoiceService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new InvoiceService(
            mockConnection,
            {} as unknown as EntityHydrator,
            {} as unknown as CounterpartyService,
            {} as never,
            mockTranslator as never,
        );
    });

    it('returns only the lines belonging to the invoice organization', async () => {
        const order = {
            id: 5,
            lines: [
                { id: 'l1', productVariant: { customFields: { organizationId: 1 } } },
                { id: 'l2', productVariant: { customFields: { organizationId: 2 } } },
            ],
        } as unknown as Order;
        mockQb.getOne.mockResolvedValue(order);
        const invoice = { id: 10, orderId: 5, organizationId: 1 } as Invoice;

        const lines = await service.getLinesForInvoice(mockCtx, invoice);

        expect(lines).toHaveLength(1);
        expect(lines[0].id).toBe('l1');
    });

    it('translates each line productVariant (name requires translations, unlike sku/customFields)', async () => {
        const variant = { customFields: { organizationId: 1 } };
        const order = {
            id: 5,
            lines: [{ id: 'l1', productVariant: variant }],
        } as unknown as Order;
        mockQb.getOne.mockResolvedValue(order);
        const invoice = { id: 10, orderId: 5, organizationId: 1 } as Invoice;

        await service.getLinesForInvoice(mockCtx, invoice);

        expect(mockTranslator.translate).toHaveBeenCalledWith(variant, mockCtx);
    });

    it('throws when the order is not found', async () => {
        mockQb.getOne.mockResolvedValue(null);
        const invoice = { id: 10, orderId: 999, organizationId: 1 } as Invoice;

        await expect(service.getLinesForInvoice(mockCtx, invoice)).rejects.toThrow(
            /Order 999 not found/,
        );
    });
});

describe('InvoiceService.findForCounterparty', () => {
    let service: InvoiceService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new InvoiceService(
            mockConnection,
            {} as unknown as EntityHydrator,
            {} as unknown as CounterpartyService,
            {} as never,
            mockTranslator as never,
        );
    });

    it('paginates and scopes by counterpartyId', async () => {
        mockQb.getManyAndCount.mockResolvedValue([[{ id: 1 }], 1]);

        const result = await service.findForCounterparty(mockCtx, '42', { take: 10, skip: 0 });

        expect(mockQb.where).toHaveBeenCalledWith('invoice.counterpartyId = :counterpartyId', {
            counterpartyId: 42,
        });
        expect(mockQb.take).toHaveBeenCalledWith(10);
        expect(mockQb.skip).toHaveBeenCalledWith(0);
        expect(result).toEqual({ items: [{ id: 1 }], totalItems: 1 });
    });

    it('applies the status filter when provided', async () => {
        mockQb.getManyAndCount.mockResolvedValue([[], 0]);

        await service.findForCounterparty(mockCtx, '42', { status: 'issued' });

        expect(mockQb.andWhere).toHaveBeenCalledWith('invoice.status = :status', {
            status: 'issued',
        });
    });
});

describe('InvoiceService.updateStatusForOrder', () => {
    let service: InvoiceService;
    const mockUpdate = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockUpdate.mockReset();
        service = new InvoiceService(
            {
                getRepository: vi.fn(() => ({ update: mockUpdate })),
            } as unknown as TransactionalConnection,
            {} as unknown as EntityHydrator,
            {} as unknown as CounterpartyService,
            {} as never,
            mockTranslator as never,
        );
    });

    it('updates the status of every invoice belonging to the order', async () => {
        await service.updateStatusForOrder(mockCtx, 7, 'paid');

        expect(mockUpdate).toHaveBeenCalledWith({ orderId: 7 }, { status: 'paid' });
    });
});
