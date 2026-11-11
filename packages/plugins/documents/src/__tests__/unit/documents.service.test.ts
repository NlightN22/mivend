import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { DocumentsService } from '../../documents.service';

const mockQb = {
    select: vi.fn(),
    distinct: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    take: vi.fn(),
    skip: vi.fn(),
    getManyAndCount: vi.fn(),
    getRawMany: vi.fn(),
};
mockQb.select.mockReturnValue(mockQb);
mockQb.distinct.mockReturnValue(mockQb);
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
    query: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
};

const mockCounterpartyService = {
    findByErpId: vi.fn(),
    findVisible: vi.fn(),
    visibleIdsSql: vi.fn(),
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
            mockRepo.query.mockResolvedValue([{ id: '42' }]);
            await service.upsertFromErp(mockCtx, {
                erpId: 'doc-1',
                type: 'return',
                counterpartyErpId: 'cnt-001',
                orderErpId: 'erp-order-1',
                number: 'RET-1',
                issueDate: '2026-07-01',
            });
            expect(mockRepo.query).toHaveBeenCalledOnce();
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
                type: 'proforma-invoice',
                search: 'INV-1',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.type = :type', {
                type: 'proforma-invoice',
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

        it('markReady sets status to ready', async () => {
            await service.markReady(mockCtx, '1');
            expect(mockRepo.update).toHaveBeenCalledWith('1', { status: 'ready' });
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

    describe('findRequisitesIdByErpId', () => {
        it('returns null when no requisites exist for that erpId', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            const result = await service.findRequisitesIdByErpId(mockCtx, 'org-unknown');
            expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { erpId: 'org-unknown' } });
            expect(result).toBeNull();
        });

        it('returns the requisites numeric id for a matching erpId', async () => {
            mockRepo.findOne.mockResolvedValue({ id: '7' });
            const result = await service.findRequisitesIdByErpId(mockCtx, 'org-1');
            expect(result).toBe(7);
        });
    });

    describe('assertRequisitesComplete', () => {
        const complete = {
            erpId: 'org-1',
            legalName: 'Org',
            inn: '123456',
            bankName: 'Bank',
            bankBik: '000000000',
            bankAccount: '000',
            legalAddress: null,
            kpp: null,
        };

        it.each(['inn', 'bankName', 'bankBik', 'bankAccount', 'legalName'])(
            'throws naming %s when it is missing',
            field => {
                expect(() =>
                    service.assertRequisitesComplete({ ...complete, [field]: null } as never),
                ).toThrow(new RegExp(`missing required requisites \\(${field}\\)`));
            },
        );

        it('does not require address, kpp, phone or signatories', () => {
            expect(() => service.assertRequisitesComplete(complete as never)).not.toThrow();
        });
    });

    describe('createProformaInvoicePlaceholder', () => {
        const proformaInvoice = {
            id: 7,
            orderId: 42,
            number: '1000042-02',
            organizationId: 2,
            counterpartyId: 5,
            amount: 12345,
            currencyCode: 'RUB',
        } as never;

        it('derives the row from the ProformaInvoice and uses its own number', async () => {
            mockRepo.findOne.mockResolvedValueOnce(null);

            const { document, created } = await service.createProformaInvoicePlaceholder(
                mockCtx,
                proformaInvoice,
            );

            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'proforma-invoice',
                    counterpartyId: '5',
                    orderId: '42',
                    proformaInvoiceId: '7',
                    number: '1000042-02',
                    amount: 12345,
                    currencyCode: 'RUB',
                }),
            );
            expect(created).toBe(true);
            expect(document).toEqual(expect.objectContaining({ number: '1000042-02' }));
        });

        it('is idempotent per snapshot: an existing document is returned, nothing is created', async () => {
            const existing = { id: 'doc-1', proformaInvoiceId: '7' };
            mockRepo.findOne.mockResolvedValueOnce(existing);
            mockRepo.create.mockClear();

            const result = await service.createProformaInvoicePlaceholder(mockCtx, proformaInvoice);

            expect(result).toEqual({ document: existing, created: false });
            expect(mockRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('findVisible', () => {
        beforeEach(() => {
            mockCounterpartyService.visibleIdsSql.mockResolvedValue({
                sql: 'SELECT CAST(c.id AS text) FROM counterparty c',
                params: { scopeBranch: 'branch-a' },
            });
            mockQb.getManyAndCount.mockResolvedValue([[{ id: 'doc-1' }], 1]);
        });

        it('embeds the visible-id subquery and never loads the visible counterparties', async () => {
            const result = await service.findVisible(mockCtx);

            expect(mockCounterpartyService.findVisible).not.toHaveBeenCalled();
            expect(mockQb.where).toHaveBeenCalledWith(
                'document.counterpartyId IN (SELECT CAST(c.id AS text) FROM counterparty c)',
                { scopeBranch: 'branch-a' },
            );
            expect(result).toEqual({ items: [{ id: 'doc-1' }], totalItems: 1 });
        });

        it('adds no visibility condition for scope all', async () => {
            mockCounterpartyService.visibleIdsSql.mockResolvedValue(null);
            await service.findVisible(mockCtx);
            expect(mockQb.where).not.toHaveBeenCalled();
        });

        it('intersects a caller counterpartyId with the scope instead of replacing it', async () => {
            await service.findVisible(mockCtx, undefined, '7');
            expect(mockQb.where).toHaveBeenCalled();
            expect(mockQb.andWhere).toHaveBeenCalledWith(
                'document.counterpartyId = :requestedCounterpartyId',
                { requestedCounterpartyId: '7' },
            );
        });

        it('applies type ILIKE, status, number search and orderId with bound parameters', async () => {
            await service.findVisible(
                mockCtx,
                { type: 'contract', status: 'ready', search: '42' },
                undefined,
                'order-1',
            );
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.orderId = :orderId', {
                orderId: 'order-1',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.type ILIKE :type', {
                type: '%contract%',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.status = :status', {
                status: 'ready',
            });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.number ILIKE :term', {
                term: '%42%',
            });
        });

        it('prefers the exact types list over type', async () => {
            await service.findVisible(mockCtx, { type: 'contract', types: ['waybill'] });
            expect(mockQb.andWhere).toHaveBeenCalledWith('document.type IN (:...types)', {
                types: ['waybill'],
            });
            expect(mockQb.andWhere).not.toHaveBeenCalledWith(
                'document.type ILIKE :type',
                expect.anything(),
            );
        });
    });

    describe('findVisibleTypes', () => {
        it('selects distinct types over the scoped subquery without loading counterparties', async () => {
            mockCounterpartyService.visibleIdsSql.mockResolvedValue({
                sql: 'SELECT 1',
                params: {},
            });
            mockQb.getRawMany.mockResolvedValue([{ type: 'contract' }, { type: 'waybill' }]);

            const result = await service.findVisibleTypes(mockCtx);

            expect(mockCounterpartyService.findVisible).not.toHaveBeenCalled();
            expect(mockQb.distinct).toHaveBeenCalledWith(true);
            expect(mockQb.where).toHaveBeenCalledWith('document.counterpartyId IN (SELECT 1)', {});
            expect(result).toEqual(['contract', 'waybill']);
        });
    });
});
