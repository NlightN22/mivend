import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { DocumentsService } from '../../documents.service';

const mockQb = {
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    take: vi.fn(),
    skip: vi.fn(),
    getManyAndCount: vi.fn(),
};
mockQb.where.mockReturnValue(mockQb);
mockQb.andWhere.mockReturnValue(mockQb);
mockQb.orderBy.mockReturnValue(mockQb);
mockQb.take.mockReturnValue(mockQb);
mockQb.skip.mockReturnValue(mockQb);

const mockRepo = {
    findOne: vi.fn(),
    findAndCount: vi.fn(),
    create: vi.fn((input: unknown) => input),
    save: vi.fn((entity: unknown) => entity),
    update: vi.fn(),
    createQueryBuilder: vi.fn(() => mockQb),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
    rawConnection: { query: vi.fn() },
};

const mockCounterpartyService = {
    findByErpId: vi.fn(),
    findVisible: vi.fn(),
};

const mockCtx = {} as unknown as RequestContext;

describe('DocumentsService', () => {
    let service: DocumentsService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new DocumentsService(
            mockConnection as unknown as TransactionalConnection,
            mockCounterpartyService as never,
        );
    });

    describe('upsertFromErp', () => {
        it('throws if the counterparty is not found', async () => {
            mockCounterpartyService.findByErpId.mockResolvedValue(null);
            await expect(
                service.upsertFromErp(mockCtx, {
                    erpId: 'doc-1',
                    type: 'return',
                    counterpartyErpId: 'missing',
                    number: 'RET-1',
                    issueDate: '2026-07-01',
                }),
            ).rejects.toThrow(UserInputError);
        });

        it('creates a new row when no document exists for the erpId (idempotency: create path)', async () => {
            mockCounterpartyService.findByErpId.mockResolvedValue({ id: '1' });
            mockRepo.findOne.mockResolvedValue(null);
            const record = {
                erpId: 'doc-1',
                type: 'return',
                counterpartyErpId: 'cnt-001',
                number: 'RET-1',
                issueDate: '2026-07-01',
                amount: 1000,
                currencyCode: 'RUB',
                fileUrl: 'https://example.com/ret-1.pdf',
            };
            await service.upsertFromErp(mockCtx, record);
            expect(mockRepo.create).toHaveBeenCalledOnce();
            expect(mockRepo.save).toHaveBeenCalledOnce();
        });

        it('updates the existing row when a document with the same erpId already exists (idempotency: update path)', async () => {
            mockCounterpartyService.findByErpId.mockResolvedValue({ id: '1' });
            const existing = { erpId: 'doc-1', number: 'OLD-NUMBER' };
            mockRepo.findOne.mockResolvedValue(existing);
            await service.upsertFromErp(mockCtx, {
                erpId: 'doc-1',
                type: 'return',
                counterpartyErpId: 'cnt-001',
                number: 'RET-1-UPDATED',
                issueDate: '2026-07-01',
            });
            expect(mockRepo.create).not.toHaveBeenCalled();
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ number: 'RET-1-UPDATED' }),
            );
        });

        it('resolves orderId via the raw customFields join when orderErpId is provided', async () => {
            mockCounterpartyService.findByErpId.mockResolvedValue({ id: '1' });
            mockRepo.findOne.mockResolvedValue(null);
            mockConnection.rawConnection.query.mockResolvedValue([{ id: '42' }]);
            await service.upsertFromErp(mockCtx, {
                erpId: 'doc-1',
                type: 'return',
                counterpartyErpId: 'cnt-001',
                orderErpId: 'erp-order-1',
                number: 'RET-1',
                issueDate: '2026-07-01',
            });
            expect(mockConnection.rawConnection.query).toHaveBeenCalledOnce();
            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ orderId: '42' }),
            );
        });
    });

    describe('findForCounterparty', () => {
        it('filters by counterpartyId and paginates', async () => {
            mockQb.getManyAndCount.mockResolvedValue([[{ id: '1' }], 1]);
            const result = await service.findForCounterparty(mockCtx, '1', { take: 10, skip: 0 });
            expect(mockQb.where).toHaveBeenCalledWith('document.counterpartyId = :counterpartyId', {
                counterpartyId: '1',
            });
            expect(mockQb.take).toHaveBeenCalledWith(10);
            expect(mockQb.skip).toHaveBeenCalledWith(0);
            expect(result).toEqual({ items: [{ id: '1' }], totalItems: 1 });
        });

        it('applies type and search filters when provided', async () => {
            mockQb.getManyAndCount.mockResolvedValue([[], 0]);
            await service.findForCounterparty(mockCtx, '1', {
                take: 10,
                skip: 0,
                type: 'invoice',
                search: 'INV-1',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.type = :type', {
                type: 'invoice',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.number ILIKE :term', {
                term: '%INV-1%',
            });
        });
    });

    describe('status transitions', () => {
        it('markGenerating sets status to generating', async () => {
            await service.markGenerating(mockCtx, '1');
            expect(mockRepo.update).toHaveBeenCalledWith('1', { status: 'generating' });
        });

        it('markReady sets status to ready and stores the assetId', async () => {
            await service.markReady(mockCtx, '1', '99');
            expect(mockRepo.update).toHaveBeenCalledWith('1', { status: 'ready', assetId: '99' });
        });

        it('markFailed sets status to failed and records the error message', async () => {
            await service.markFailed(mockCtx, '1', 'boom');
            expect(mockRepo.update).toHaveBeenCalledWith('1', {
                status: 'failed',
                metadata: { error: 'boom' },
            });
        });
    });

    describe('getActiveRequisites', () => {
        it('throws a clear error when no active requisites exist', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            await expect(service.getActiveRequisites(mockCtx)).rejects.toThrow(
                /No active OrganizationRequisites/,
            );
        });

        it('returns the active requisites row when present', async () => {
            const requisites = { id: '1', legalName: 'Demo Co', isActive: true };
            mockRepo.findOne.mockResolvedValue(requisites);
            const result = await service.getActiveRequisites(mockCtx);
            expect(result).toBe(requisites);
        });
    });

    describe('getRequisitesById', () => {
        it('throws when no requisites exist for that organizationId', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            await expect(service.getRequisitesById(mockCtx, 99)).rejects.toThrow(
                /OrganizationRequisites 99 not found/,
            );
        });

        it('returns the requisites row for that organizationId', async () => {
            const requisites = { id: '2', legalName: 'North Co' };
            mockRepo.findOne.mockResolvedValue(requisites);
            const result = await service.getRequisitesById(mockCtx, 2);
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: 2 } });
            expect(result).toBe(requisites);
        });
    });

    describe('createInvoicePlaceholder', () => {
        it('derives counterpartyId/amount/currency/invoiceId from the given Invoice, not the order', async () => {
            const order = { id: 42, code: 'ORD-1' } as never;
            const invoice = {
                id: 7,
                organizationId: 2,
                counterpartyId: 5,
                amount: 12345,
                currencyCode: 'RUB',
            } as never;

            const result = await service.createInvoicePlaceholder(mockCtx, order, invoice);

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'invoice',
                    counterpartyId: '5',
                    orderId: '42',
                    invoiceId: '7',
                    number: 'ORD-1-2',
                    amount: 12345,
                    currencyCode: 'RUB',
                }),
            );
            expect(result).toEqual(expect.objectContaining({ invoiceId: '7', number: 'ORD-1-2' }));
        });
    });

    describe('findVisible', () => {
        it('returns no rows without querying documents when no counterparty is visible', async () => {
            mockCounterpartyService.findVisible.mockResolvedValue([]);
            const result = await service.findVisible(mockCtx);
            expect(result).toEqual({ items: [], totalItems: 0 });
            expect(mockRepo.findAndCount).not.toHaveBeenCalled();
        });

        it('filters documents by exactly the counterparty ids CounterpartyService.findVisible returned', async () => {
            mockCounterpartyService.findVisible.mockResolvedValue([{ id: '1' }, { id: '2' }]);
            mockRepo.findAndCount.mockResolvedValue([[{ id: 'doc-1' }], 1]);

            const result = await service.findVisible(mockCtx);

            expect(mockRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({ counterpartyId: expect.anything() }),
                }),
            );
            expect(result).toEqual({ items: [{ id: 'doc-1' }], totalItems: 1 });
        });

        it("intersects the type/status filter with the caller's visible-counterparty scope, not either alone", async () => {
            mockCounterpartyService.findVisible.mockResolvedValue([{ id: '1' }]);
            mockRepo.findAndCount.mockResolvedValue([[], 0]);

            await service.findVisible(mockCtx, { type: 'contract', status: 'ready' });

            expect(mockRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        counterpartyId: expect.anything(),
                        type: 'contract',
                        status: 'ready',
                    }),
                }),
            );
        });

        it('omits type/status from the where clause entirely when not provided', async () => {
            mockCounterpartyService.findVisible.mockResolvedValue([{ id: '1' }]);
            mockRepo.findAndCount.mockResolvedValue([[], 0]);

            await service.findVisible(mockCtx);

            const where = mockRepo.findAndCount.mock.calls[0][0].where;
            expect(where).not.toHaveProperty('type');
            expect(where).not.toHaveProperty('status');
        });
    });
});
