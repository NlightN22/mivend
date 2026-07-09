import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';
import { DocumentsService } from '../../documents.service';

const mockRepo = {
    findOne: vi.fn(),
    findAndCount: vi.fn(),
    create: vi.fn((input: unknown) => input),
    save: vi.fn((entity: unknown) => entity),
    update: vi.fn(),
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
            mockRepo.findAndCount.mockResolvedValue([[{ id: '1' }], 1]);
            const result = await service.findForCounterparty(mockCtx, '1', { take: 10, skip: 0 });
            expect(mockRepo.findAndCount).toHaveBeenCalledWith(
                expect.objectContaining({ where: { counterpartyId: '1' }, take: 10, skip: 0 }),
            );
            expect(result).toEqual({ items: [{ id: '1' }], totalItems: 1 });
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
    });
});
